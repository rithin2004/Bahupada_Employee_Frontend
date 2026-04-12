import base64
import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.api.routers.auth import require_permission
from app.db.session import get_db
from app.models.entities import (
    HSNMaster,
    InventoryBatch,
    PartyLedgerAccount,
    PartyLedgerEntry,
    PartyLedgerPayment,
    PartyType,
    Pricing,
    Product,
    ProductBrand,
    ProductCategory,
    ProductSubCategory,
    PurchaseBill,
    PurchaseBillItem,
    PurchaseBillPaymentAllocation,
    PurchaseChallan,
    PurchaseChallanItem,
    PurchaseExpiry,
    PurchaseExpiryItem,
    PurchaseReturn,
    PurchaseReturnItem,
    Rack,
    ReorderItem,
    ReorderLog,
    StockMovement,
    StockMoveType,
    Transaction,
    Unit,
    Vendor,
    VendorBrand,
    VoucherStatus,
    Warehouse,
    WarehouseTransfer,
    WarehouseTransferItem,
)
from app.schemas.procurement import (
    PurchaseBillCreate,
    PurchaseBillUpdate,
    PurchaseEntryBootstrap,
    PurchaseEntryProductSummary,
    PurchaseEntryVendorSummary,
    PurchaseChallanCreate,
    PurchaseExpiryCreate,
    PurchaseReturnCreate,
    ReorderLogCreate,
    WarehouseTransferCreate,
)
from app.services.idempotency import idempotency_precheck, idempotency_store_response
from app.services.finance import post_vendor_purchase_bill_payable
from app.services.stock import post_purchase_bill

router = APIRouter()


def _encode_stock_cursor(created_at: datetime, batch_id: str) -> str:
    payload = {"created_at": created_at.isoformat(), "batch_id": batch_id}
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")


def _decode_stock_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload = json.loads(raw)
        return datetime.fromisoformat(str(payload["created_at"])), uuid.UUID(str(payload["batch_id"]))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cursor") from exc


def _challan_batch_no(challan_id: uuid.UUID, line_number: int, created_at: datetime | None = None) -> str:
    ts = (created_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return f"CHL-{ts.strftime('%Y%m%d-%H%M%S')}-{str(challan_id)[:4].upper()}-{line_number:03d}"


def _purchase_entry_number(now: datetime | None = None) -> str:
    ts = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return f"P{ts.strftime('%y%m%d%H%M%S')}"


def _purchase_bill_batch_no(bill_number: str, line_number: int, now: datetime | None = None) -> str:
    ts = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    compact_bill = "".join(ch for ch in bill_number.upper() if ch.isalnum())[-8:] or "AUTO"
    return f"PBL-{ts.strftime('%Y%m%d')}-{compact_bill}-{line_number:03d}"


def _as_decimal(value: Decimal | int | float | None) -> Decimal:
    return Decimal(value or 0)


def _normalize_unit_ratio(base_quantity: Decimal, conv_2_to_1: Decimal | None, conv_3_to_1: Decimal | None) -> tuple[str, dict[str, Decimal]]:
    base = Decimal(base_quantity or 0)
    conv2 = Decimal(conv_2_to_1 or 0)
    conv3 = Decimal(conv_3_to_1 or 0)
    third = Decimal("0")
    second = Decimal("0")
    first = base
    if conv3 > 0:
        third = (base // conv3)
        first = base - (third * conv3)
    if conv2 > 0:
        second = (first // conv2)
        first = first - (second * conv2)
    ratio = f"{int(third)} : {int(second)} : {int(first)}"
    return ratio, {"quantity_1st": first, "quantity_2nd": second, "quantity_3rd": third}


def _derive_tax_type(*, warehouse_state: str | None, vendor_gstin: str | None, vendor_state: str | None) -> str:
    warehouse_state_normalized = (warehouse_state or "").strip().upper()
    vendor_state_from_gstin = ""
    if vendor_gstin and len(vendor_gstin) >= 2 and vendor_gstin[:2].isdigit():
        vendor_state_from_gstin = vendor_gstin[:2]
    vendor_state_normalized = (vendor_state or "").strip().upper()
    if vendor_state_from_gstin and warehouse_state_normalized:
        # GST state code compare can be added later once warehouse keeps code; for now fallback to name compare.
        pass
    if warehouse_state_normalized and vendor_state_normalized and warehouse_state_normalized == vendor_state_normalized:
        return "LOCAL"
    return "CENTRAL"


async def _unit_name(db: AsyncSession, unit_id: uuid.UUID | None) -> str | None:
    if unit_id is None:
        return None
    unit = await db.get(Unit, unit_id)
    return unit.unit_name if unit else None


async def _build_vendor_summary(db: AsyncSession, vendor: Vendor) -> PurchaseEntryVendorSummary:
    today = datetime.now(timezone.utc).date()
    month_start = today.replace(day=1)
    year_start = date(today.year, 1, 1)

    annual_purchase_amount = (
        await db.execute(
            select(func.coalesce(func.sum(PurchaseBill.total_amount), Decimal("0"))).where(
                PurchaseBill.vendor_id == vendor.id,
                PurchaseBill.deleted_at.is_(None),
                PurchaseBill.bill_date >= year_start,
            )
        )
    ).scalar_one()
    monthly_purchase_amount = (
        await db.execute(
            select(func.coalesce(func.sum(PurchaseBill.total_amount), Decimal("0"))).where(
                PurchaseBill.vendor_id == vendor.id,
                PurchaseBill.deleted_at.is_(None),
                PurchaseBill.bill_date >= month_start,
            )
        )
    ).scalar_one()
    last_purchase_date = (
        await db.execute(
            select(PurchaseBill.bill_date)
            .where(PurchaseBill.vendor_id == vendor.id, PurchaseBill.deleted_at.is_(None))
            .order_by(PurchaseBill.bill_date.desc(), PurchaseBill.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    last_bills_rows = (
        await db.execute(
            select(PurchaseBill.bill_number, PurchaseBill.bill_date, PurchaseBill.total_amount)
            .where(PurchaseBill.vendor_id == vendor.id, PurchaseBill.deleted_at.is_(None))
            .order_by(PurchaseBill.bill_date.desc(), PurchaseBill.created_at.desc())
            .limit(3)
        )
    ).all()
    open_challans_rows = (
        await db.execute(
            select(
                PurchaseChallan.id,
                PurchaseChallan.reference_no,
                PurchaseChallan.created_at,
                func.count(PurchaseChallanItem.id),
            )
            .outerjoin(PurchaseChallanItem, PurchaseChallanItem.purchase_challan_id == PurchaseChallan.id)
            .outerjoin(
                PurchaseBill,
                and_(
                    PurchaseBill.purchase_challan_id == PurchaseChallan.id,
                    PurchaseBill.deleted_at.is_(None),
                ),
            )
            .where(
                PurchaseChallan.vendor_id == vendor.id,
                PurchaseChallan.deleted_at.is_(None),
                PurchaseBill.id.is_(None),
            )
            .group_by(PurchaseChallan.id, PurchaseChallan.reference_no, PurchaseChallan.created_at)
            .order_by(PurchaseChallan.created_at.desc())
            .limit(5)
        )
    ).all()
    account = (
        await db.execute(
            select(PartyLedgerAccount).where(PartyLedgerAccount.party_type == PartyType.VENDOR, PartyLedgerAccount.party_id == vendor.id)
        )
    ).scalar_one_or_none()
    balance = Decimal("0")
    balance_side = "CR"
    last_payment_date = None
    if account is not None:
        totals = (
            await db.execute(
                select(
                    func.coalesce(func.sum(PartyLedgerEntry.admin_debit), Decimal("0")),
                    func.coalesce(func.sum(PartyLedgerEntry.admin_credit), Decimal("0")),
                ).where(PartyLedgerEntry.account_id == account.id)
            )
        ).one()
        debit_total = Decimal(totals[0] or 0)
        credit_total = Decimal(totals[1] or 0)
        net = credit_total - debit_total
        balance = abs(net)
        balance_side = "CR" if net >= 0 else "DR"
        last_payment_date = (
            await db.execute(
                select(PartyLedgerPayment.payment_date)
                .where(PartyLedgerPayment.account_id == account.id)
                .order_by(PartyLedgerPayment.payment_date.desc(), PartyLedgerPayment.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    brand_names = (
        await db.execute(
            select(ProductBrand.name)
            .join(VendorBrand, VendorBrand.brand_id == ProductBrand.id)
            .where(VendorBrand.vendor_id == vendor.id, VendorBrand.is_active.is_(True))
            .order_by(VendorBrand.is_primary.desc(), ProductBrand.name.asc())
        )
    ).scalars().all()
    address_lines = [line for line in [vendor.firm_name or vendor.name, vendor.street, vendor.city, vendor.state, vendor.pincode] if line]
    return PurchaseEntryVendorSummary(
        vendor_id=vendor.id,
        vendor_name=vendor.firm_name or vendor.name,
        address_lines=address_lines,
        brand_names=[str(name) for name in brand_names],
        purchase_type=vendor.purchase_type,
        city=vendor.city,
        state=vendor.state,
        pincode=vendor.pincode,
        gstin=vendor.gstin,
        owner_name=vendor.owner_name,
        phone=vendor.phone,
        area=vendor.city,
        route=None,
        annual_purchase_amount=Decimal(annual_purchase_amount or 0),
        monthly_purchase_amount=Decimal(monthly_purchase_amount or 0),
        balance=balance,
        balance_side=balance_side,
        last_purchase_date=last_purchase_date,
        last_payment_date=last_payment_date,
        last_bills=[
            {"bill_number": row[0], "bill_date": row[1], "total_amount": Decimal(row[2] or 0)}
            for row in last_bills_rows
        ],
        open_challans=[
            {
                "challan_id": row[0],
                "reference_no": row[1],
                "challan_date": row[2].date() if row[2] else None,
                "item_count": int(row[3] or 0),
            }
            for row in open_challans_rows
        ],
    )


async def _build_product_summary(db: AsyncSession, product: Product) -> PurchaseEntryProductSummary:
    pricing = (
        await db.execute(select(Pricing).where(Pricing.product_id == product.id))
    ).scalar_one_or_none()
    hsn = await db.get(HSNMaster, product.hsn_id) if product.hsn_id else None
    stock_total = (
        await db.execute(
            select(func.coalesce(func.sum(InventoryBatch.available_quantity), Decimal("0"))).where(InventoryBatch.product_id == product.id)
        )
    ).scalar_one()
    latest_line = (
        await db.execute(
            select(
                PurchaseBillItem.rate_value,
                PurchaseBillItem.rate_unit_level,
                PurchaseBillItem.discount_percent,
                PurchaseBill.bill_number,
                PurchaseBill.bill_date,
                PurchaseBillItem.line_total_amount,
            )
            .join(PurchaseBill, PurchaseBill.id == PurchaseBillItem.purchase_bill_id)
            .where(PurchaseBillItem.product_id == product.id, PurchaseBill.deleted_at.is_(None))
            .order_by(PurchaseBill.bill_date.desc(), PurchaseBill.created_at.desc(), PurchaseBillItem.id.desc())
            .limit(3)
        )
    ).all()
    conv2 = Decimal(product.conv_2_to_1 or 0)
    conv3 = Decimal(product.conv_3_to_1 or 0)
    stock_ratio, _ = _normalize_unit_ratio(Decimal(stock_total or 0), conv2, conv3)

    return PurchaseEntryProductSummary(
        product_id=product.id,
        sku=product.sku,
        name=product.name,
        brand=product.brand,
        description=product.description,
        hsn_code=hsn.hsn_code if hsn else None,
        tax_percent=Decimal(product.tax_percent or 0),
        mrp=Decimal(pricing.mrp if pricing else 0),
        cost_price=Decimal(pricing.cost_price if pricing else 0),
        unit_1st_name=await _unit_name(db, product.primary_unit_id),
        unit_2nd_name=await _unit_name(db, product.secondary_unit_id),
        unit_3rd_name=await _unit_name(db, product.third_unit_id),
        unit_1st_id=product.primary_unit_id,
        unit_2nd_id=product.secondary_unit_id,
        unit_3rd_id=product.third_unit_id,
        conv_2_to_1=conv2 if conv2 > 0 else None,
        conv_3_to_2=Decimal(product.conv_3_to_2 or 0) if product.conv_3_to_2 else None,
        conv_3_to_1=conv3 if conv3 > 0 else None,
        stock_base_quantity=Decimal(stock_total or 0),
        stock_ratio=stock_ratio,
        latest_rate_value=Decimal(latest_line[0][0] or 0) if latest_line else None,
        latest_rate_unit_level=int(latest_line[0][1]) if latest_line and latest_line[0][1] is not None else None,
        latest_discount_percent=Decimal(latest_line[0][2] or 0) if latest_line else None,
        recent_bills=[
            {
                "bill_number": row[3],
                "bill_date": row[4],
                "line_total_amount": Decimal(row[5] or 0),
            }
            for row in latest_line
        ],
    )


def _rate_per_base_unit(rate_value: Decimal, rate_unit_level: int | None, conv_2_to_1: Decimal | None, conv_3_to_1: Decimal | None) -> Decimal:
    level = int(rate_unit_level or 1)
    if level == 2:
        conv2 = Decimal(conv_2_to_1 or 0)
        return Decimal(rate_value) / conv2 if conv2 > 0 else Decimal(rate_value)
    if level == 3:
        conv3 = Decimal(conv_3_to_1 or 0)
        return Decimal(rate_value) / conv3 if conv3 > 0 else Decimal(rate_value)
    return Decimal(rate_value)


async def _create_purchase_bill_internal(
    db: AsyncSession,
    payload: PurchaseBillCreate,
    existing_bill: PurchaseBill | None = None,
) -> PurchaseBill:
    challan = None
    vendor_id = payload.vendor_id
    warehouse_id = payload.warehouse_id
    rack_id = payload.rack_id

    challan_items: list[PurchaseChallanItem] = []
    challan_qty_by_product: dict[uuid.UUID, Decimal] = {}
    challan_batch_by_product: dict[uuid.UUID, str] = {}
    if payload.challan_id is not None:
        challan = await db.get(PurchaseChallan, payload.challan_id)
        if challan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase challan not found")
        vendor_id = challan.vendor_id
        warehouse_id = challan.warehouse_id
        rack_id = challan.rack_id
        challan_items = (
            await db.execute(select(PurchaseChallanItem).where(PurchaseChallanItem.purchase_challan_id == challan.id))
        ).scalars().all()
        for item in challan_items:
            challan_qty_by_product[item.product_id] = challan_qty_by_product.get(item.product_id, Decimal("0")) + Decimal(item.quantity)
            if item.product_id not in challan_batch_by_product and item.batch_number:
                challan_batch_by_product[item.product_id] = item.batch_number
    else:
        if vendor_id is None or warehouse_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="vendor_id and warehouse_id are required when challan_id is not provided",
            )
        vendor = await db.get(Vendor, vendor_id)
        if vendor is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        warehouse = await db.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found")
    remaining_challan_qty = dict(challan_qty_by_product)
    vendor = await db.get(Vendor, vendor_id)
    warehouse = await db.get(Warehouse, warehouse_id)

    derived_tax_type = payload.tax_type or vendor.purchase_type or _derive_tax_type(
        warehouse_state=warehouse.state if warehouse else None,
        vendor_gstin=vendor.gstin if vendor else None,
        vendor_state=vendor.state if vendor else None,
    )
    if existing_bill is None:
        bill = PurchaseBill(
            purchase_challan_id=payload.challan_id,
            vendor_id=vendor_id,
            warehouse_id=warehouse_id,
            rack_id=rack_id,
            bill_number=payload.bill_number,
            bill_date=payload.bill_date,
            received_date=payload.received_date,
            payment_mode=(payload.payment_mode or "CREDIT").upper(),
            tax_type=derived_tax_type,
            freight_amount=Decimal(payload.freight_amount or 0),
            entry_number=payload.entry_number or _purchase_entry_number(),
            notes=payload.notes,
            subtotal=Decimal("0"),
            gst_amount=Decimal("0"),
            total_amount=Decimal("0"),
            status=VoucherStatus.POSTED.value,
            posted=True,
        )
        db.add(bill)
        await db.flush()
    else:
        bill = existing_bill
        bill.purchase_challan_id = payload.challan_id
        bill.vendor_id = vendor_id
        bill.warehouse_id = warehouse_id
        bill.rack_id = rack_id
        bill.bill_number = payload.bill_number
        bill.bill_date = payload.bill_date
        bill.received_date = payload.received_date
        bill.payment_mode = (payload.payment_mode or "CREDIT").upper()
        bill.tax_type = derived_tax_type
        bill.freight_amount = Decimal(payload.freight_amount or 0)
        bill.entry_number = payload.entry_number or bill.entry_number or _purchase_entry_number()
        bill.notes = payload.notes
        bill.subtotal = Decimal("0")
        bill.gst_amount = Decimal("0")
        bill.total_amount = Decimal("0")
        bill.status = VoucherStatus.POSTED.value
        bill.posted = True

    subtotal = Decimal("0")
    gst_total = Decimal("0")

    for index, item in enumerate(payload.items, start=1):
        if item.damaged_quantity < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="damaged_quantity cannot be negative")

        product = await db.get(Product, item.product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        pricing_row = (
            await db.execute(select(Pricing).where(Pricing.product_id == product.id))
        ).scalar_one_or_none()

        qty1 = Decimal(item.quantity_1st or 0)
        qty2 = Decimal(item.quantity_2nd or 0)
        qty3 = Decimal(item.quantity_3rd or 0)
        conv2 = Decimal(product.conv_2_to_1 or 0)
        conv3 = Decimal(product.conv_3_to_1 or 0)
        base_quantity = Decimal(item.base_quantity or 0)
        if base_quantity <= 0:
            base_quantity = qty1 + (qty2 * conv2) + (qty3 * conv3)
        if base_quantity <= 0:
            base_quantity = Decimal(item.quantity or 0)
        if base_quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Line quantity must be positive")

        damaged_qty = Decimal(item.damaged_quantity or 0)
        if damaged_qty > base_quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="damaged_quantity cannot exceed quantity")

        rate_value = Decimal(item.rate_value if item.rate_value is not None else item.unit_price)
        rate_unit_level = int(item.rate_unit_level or 1)
        unit_price = _rate_per_base_unit(rate_value, rate_unit_level, conv2, conv3)
        line_subtotal = Decimal(item.line_subtotal or (base_quantity * unit_price))
        discount_percent = Decimal(item.discount_percent or 0)
        percent_discount_amount = (line_subtotal * discount_percent / Decimal("100")) if discount_percent > 0 else Decimal("0")
        discount_lumpsum = Decimal(item.discount_lumpsum or 0)
        line_discount_amount = Decimal(item.line_discount_amount or (percent_discount_amount + discount_lumpsum))
        taxable_amount = Decimal(item.line_taxable_amount or (line_subtotal - line_discount_amount))
        tax_percent = Decimal(product.tax_percent or 0)
        line_tax_amount = Decimal(item.line_tax_amount or (taxable_amount * tax_percent / Decimal("100")))
        line_total_amount = Decimal(item.line_total_amount or (taxable_amount + line_tax_amount))

        if item.mrp is not None:
            next_mrp = Decimal(item.mrp or 0)
            if pricing_row is None:
                pricing_row = Pricing(
                    product_id=product.id,
                    mrp=next_mrp,
                    cost_price=Decimal(item.unit_price or 0),
                    a_class_price=Decimal("0"),
                    b_class_price=Decimal("0"),
                    c_class_price=Decimal("0"),
                    is_active=True,
                )
                db.add(pricing_row)
            else:
                pricing_row.mrp = next_mrp

        subtotal += taxable_amount
        gst_total += line_tax_amount

        batch_no = item.batch_no or _purchase_bill_batch_no(payload.bill_number, index)

        db.add(
            PurchaseBillItem(
                purchase_bill_id=bill.id,
                product_id=item.product_id,
                batch_no=batch_no,
                batch_number=batch_no,
                expiry_date=item.expiry_date,
                quantity=base_quantity,
                quantity_1st=qty1 if qty1 > 0 else None,
                quantity_2nd=qty2 if qty2 > 0 else None,
                quantity_3rd=qty3 if qty3 > 0 else None,
                unit_1st_id=item.unit_1st_id or product.primary_unit_id,
                unit_2nd_id=item.unit_2nd_id or product.secondary_unit_id,
                unit_3rd_id=item.unit_3rd_id or product.third_unit_id,
                base_quantity=base_quantity,
                damaged_quantity=damaged_qty,
                unit_price=unit_price,
                purchase_price=unit_price,
                rate_value=rate_value,
                rate_unit_level=rate_unit_level,
                discount_percent=discount_percent if discount_percent > 0 else None,
                discount_lumpsum=discount_lumpsum if discount_lumpsum > 0 else None,
                line_subtotal=line_subtotal,
                line_discount_amount=line_discount_amount,
                line_taxable_amount=taxable_amount,
                line_tax_amount=line_tax_amount,
                line_total_amount=line_total_amount,
            )
        )

        final_available = base_quantity - damaged_qty
        if challan is not None:
            baseline = remaining_challan_qty.get(item.product_id, Decimal("0"))
            allocated_baseline = baseline if baseline <= base_quantity else base_quantity
            remaining_challan_qty[item.product_id] = baseline - allocated_baseline
            delta_available = final_available - allocated_baseline
        else:
            delta_available = final_available

        batch_res = await db.execute(
            select(InventoryBatch).where(
                InventoryBatch.warehouse_id == warehouse_id,
                InventoryBatch.product_id == item.product_id,
                InventoryBatch.batch_no == batch_no,
            )
        )
        batch = batch_res.scalar_one_or_none()
        if batch is None:
            batch = InventoryBatch(
                warehouse_id=warehouse_id,
                product_id=item.product_id,
                batch_no=batch_no,
                expiry_date=item.expiry_date,
                available_quantity=Decimal("0"),
                reserved_quantity=Decimal("0"),
                damaged_quantity=Decimal("0"),
            )
            db.add(batch)

        batch.available_quantity = Decimal(batch.available_quantity) + delta_available
        batch.damaged_quantity = Decimal(batch.damaged_quantity) + damaged_qty
        if item.expiry_date:
            batch.expiry_date = item.expiry_date

        if delta_available > 0:
            db.add(
                StockMovement(
                    warehouse_id=warehouse_id,
                    product_id=item.product_id,
                    batch_no=batch_no,
                    move_type=StockMoveType.IN,
                    quantity=delta_available,
                    reference_type="purchase_bill_adjust",
                    reference_id=bill.id,
                    created_at=datetime.now(timezone.utc),
                )
            )
        elif delta_available < 0:
            db.add(
                StockMovement(
                    warehouse_id=warehouse_id,
                    product_id=item.product_id,
                    batch_no=batch_no,
                    move_type=StockMoveType.OUT,
                    quantity=abs(delta_available),
                    reference_type="purchase_bill_adjust",
                    reference_id=bill.id,
                    created_at=datetime.now(timezone.utc),
                )
            )

        if damaged_qty > 0:
            db.add(
                StockMovement(
                    warehouse_id=warehouse_id,
                    product_id=item.product_id,
                    batch_no=batch_no,
                    move_type=StockMoveType.ADJUST,
                    quantity=damaged_qty,
                    reference_type="purchase_bill_damage",
                    reference_id=bill.id,
                    created_at=datetime.now(timezone.utc),
                )
            )

    if challan is not None:
        for product_id, missing_qty in remaining_challan_qty.items():
            if missing_qty <= 0:
                continue
            batch_no = challan_batch_by_product.get(product_id, _challan_batch_no(challan.id, 1))
            batch_res = await db.execute(
                select(InventoryBatch).where(
                    InventoryBatch.warehouse_id == warehouse_id,
                    InventoryBatch.product_id == product_id,
                    InventoryBatch.batch_no == batch_no,
                )
            )
            batch = batch_res.scalar_one_or_none()
            if batch is not None:
                batch.available_quantity = Decimal(batch.available_quantity) - missing_qty
            db.add(
                StockMovement(
                    warehouse_id=warehouse_id,
                    product_id=product_id,
                    batch_no=batch_no,
                    move_type=StockMoveType.OUT,
                    quantity=missing_qty,
                    reference_type="purchase_bill_shortage",
                    reference_id=bill.id,
                    created_at=datetime.now(timezone.utc),
                )
            )

    bill.subtotal = subtotal
    bill.gst_amount = gst_total
    bill.total_amount = subtotal + gst_total + Decimal(payload.freight_amount or 0)
    await db.flush()
    return bill


async def _reverse_purchase_bill_effects(db: AsyncSession, bill: PurchaseBill) -> None:
    allocation_exists = (
        await db.execute(
            select(PurchaseBillPaymentAllocation.id).where(PurchaseBillPaymentAllocation.purchase_bill_id == bill.id).limit(1)
        )
    ).scalar_one_or_none()
    if allocation_exists is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit a purchase bill with linked payment allocations",
        )

    movements = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.reference_id == bill.id,
                StockMovement.reference_type.in_(
                    ["purchase_bill", "purchase_bill_adjust", "purchase_bill_damage", "purchase_bill_shortage"]
                ),
            )
        )
    ).scalars().all()

    for movement in movements:
        batch = (
            await db.execute(
                select(InventoryBatch).where(
                    InventoryBatch.warehouse_id == movement.warehouse_id,
                    InventoryBatch.product_id == movement.product_id,
                    InventoryBatch.batch_no == movement.batch_no,
                )
            )
        ).scalar_one_or_none()
        if batch is not None:
            qty = Decimal(movement.quantity or 0)
            if movement.move_type == StockMoveType.IN:
                batch.available_quantity = Decimal(batch.available_quantity or 0) - qty
            elif movement.move_type == StockMoveType.OUT:
                batch.available_quantity = Decimal(batch.available_quantity or 0) + qty
            elif movement.move_type == StockMoveType.ADJUST:
                batch.damaged_quantity = Decimal(batch.damaged_quantity or 0) - qty
        await db.delete(movement)

    bill_items = (
        await db.execute(select(PurchaseBillItem).where(PurchaseBillItem.purchase_bill_id == bill.id))
    ).scalars().all()
    for item in bill_items:
        await db.delete(item)

    party_entries = (
        await db.execute(
            select(PartyLedgerEntry).where(
                PartyLedgerEntry.reference_type == "purchase_bill",
                PartyLedgerEntry.reference_id == bill.id,
            )
        )
    ).scalars().all()
    for entry in party_entries:
        await db.delete(entry)

    transactions = (
        await db.execute(
            select(Transaction).where(
                Transaction.reference_type == "purchase_bill",
                Transaction.reference_id == bill.id,
            )
        )
    ).scalars().all()
    for transaction in transactions:
        await db.delete(transaction)


async def _reverse_purchase_challan_effects(db: AsyncSession, challan: PurchaseChallan) -> None:
    linked_bill_exists = (
        await db.execute(
            select(PurchaseBill.id).where(
                PurchaseBill.purchase_challan_id == challan.id,
                PurchaseBill.deleted_at.is_(None),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if linked_bill_exists is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit or delete a purchase challan that is already linked to a purchase bill",
        )

    movements = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.reference_type == "purchase_challan",
                StockMovement.reference_id == challan.id,
            )
        )
    ).scalars().all()

    for movement in movements:
        batch = (
            await db.execute(
                select(InventoryBatch).where(
                    InventoryBatch.warehouse_id == movement.warehouse_id,
                    InventoryBatch.product_id == movement.product_id,
                    InventoryBatch.batch_no == movement.batch_no,
                )
            )
        ).scalar_one_or_none()
        if batch is not None:
            qty = Decimal(movement.quantity or 0)
            if movement.move_type == StockMoveType.IN:
                batch.available_quantity = Decimal(batch.available_quantity or 0) - qty
            elif movement.move_type == StockMoveType.OUT:
                batch.available_quantity = Decimal(batch.available_quantity or 0) + qty
            elif movement.move_type == StockMoveType.ADJUST:
                batch.damaged_quantity = Decimal(batch.damaged_quantity or 0) - qty
        await db.delete(movement)

    challan_items = (
        await db.execute(select(PurchaseChallanItem).where(PurchaseChallanItem.purchase_challan_id == challan.id))
    ).scalars().all()
    for item in challan_items:
        await db.delete(item)


@router.post("/purchase-challans", dependencies=[Depends(require_permission("purchase", "create"))])
async def create_purchase_challan(
    payload: PurchaseChallanCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db, idempotency_key, "procurement:create_purchase_challan", payload.model_dump(mode="json")
    )
    if replay_body is not None:
        return replay_body

    challan = PurchaseChallan(
        warehouse_id=payload.warehouse_id,
        vendor_id=payload.vendor_id,
        rack_id=payload.rack_id,
        reference_no=payload.reference_no,
        status=VoucherStatus.CREATED.value,
    )
    db.add(challan)
    await db.flush()

    for index, item in enumerate(payload.items, start=1):
        batch_no = _challan_batch_no(challan.id, index, challan.created_at)
        db.add(
            PurchaseChallanItem(
                purchase_challan_id=challan.id,
                product_id=item.product_id,
                rack_id=payload.rack_id,
                batch_number=batch_no,
                expiry_date=item.expiry_date,
                quantity=item.quantity,
            )
        )
        batch_res = await db.execute(
            select(InventoryBatch).where(
                InventoryBatch.warehouse_id == payload.warehouse_id,
                InventoryBatch.product_id == item.product_id,
                InventoryBatch.batch_no == batch_no,
            )
        )
        batch = batch_res.scalar_one_or_none()
        if batch is None:
            batch = InventoryBatch(
                warehouse_id=payload.warehouse_id,
                product_id=item.product_id,
                batch_no=batch_no,
                expiry_date=item.expiry_date,
                available_quantity=Decimal("0"),
                reserved_quantity=Decimal("0"),
                damaged_quantity=Decimal("0"),
            )
            db.add(batch)

        batch.available_quantity = Decimal(batch.available_quantity) + Decimal(item.quantity)
        if item.expiry_date:
            batch.expiry_date = item.expiry_date
        db.add(
            StockMovement(
                warehouse_id=payload.warehouse_id,
                product_id=item.product_id,
                batch_no=batch_no,
                move_type=StockMoveType.IN,
                quantity=item.quantity,
                reference_type="purchase_challan",
                reference_id=challan.id,
                created_at=datetime.now(timezone.utc),
            )
        )

    await db.commit()
    await db.refresh(challan)
    response = jsonable_encoder(challan)
    await idempotency_store_response(
        db, idempotency_key, "procurement:create_purchase_challan", req_hash, replay_code or 201, response
    )
    return response


@router.get("/purchase-challans", dependencies=[Depends(require_permission("purchase", "read"))])
async def list_purchase_challans(db: AsyncSession = Depends(get_db)):
    challans = (
        await db.execute(select(PurchaseChallan).where(PurchaseChallan.deleted_at.is_(None)).order_by(PurchaseChallan.created_at.desc()))
    ).scalars().all()

    response: list[dict] = []
    for challan in challans:
        vendor = await db.get(Vendor, challan.vendor_id)
        warehouse = await db.get(Warehouse, challan.warehouse_id)
        rack = await db.get(Rack, challan.rack_id) if challan.rack_id else None
        items = (
            await db.execute(
                select(PurchaseChallanItem).where(PurchaseChallanItem.purchase_challan_id == challan.id).order_by(PurchaseChallanItem.id.asc())
            )
        ).scalars().all()
        item_rows: list[dict] = []
        for item in items:
            product = await db.get(Product, item.product_id)
            item_rows.append(
                {
                    "id": str(item.id),
                    "product_id": str(item.product_id),
                    "sku": product.sku if product else "",
                    "name": product.name if product else "",
                    "batch_no": item.batch_number,
                    "expiry_date": str(item.expiry_date) if item.expiry_date else None,
                    "quantity": item.quantity,
                    "rack_id": str(item.rack_id) if item.rack_id else None,
                }
            )
        response.append(
            {
                "id": str(challan.id),
                "reference_no": challan.reference_no,
                "status": challan.status,
                "vendor_id": str(challan.vendor_id),
                "vendor_name": vendor.name if vendor else "",
                "warehouse_id": str(challan.warehouse_id),
                "warehouse_name": warehouse.name if warehouse else "",
                "rack_id": str(challan.rack_id) if challan.rack_id else None,
                "rack_type": rack.rack_type if rack else None,
                "items": item_rows,
            }
        )
    return response


@router.get("/purchase-challans/{purchase_challan_id}", dependencies=[Depends(require_permission("purchase", "read"))])
async def get_purchase_challan(purchase_challan_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    challan = await db.get(PurchaseChallan, purchase_challan_id)
    if challan is None or challan.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase challan not found")

    items = (
        await db.execute(
            select(PurchaseChallanItem).where(PurchaseChallanItem.purchase_challan_id == challan.id).order_by(PurchaseChallanItem.id.asc())
        )
    ).scalars().all()
    item_rows: list[dict] = []
    for item in items:
        product = await db.get(Product, item.product_id)
        item_rows.append(
            {
                "id": str(item.id),
                "product_id": str(item.product_id),
                "sku": product.sku if product else "",
                "name": product.name if product else "",
                "batch_no": item.batch_number,
                "expiry_date": str(item.expiry_date) if item.expiry_date else "",
                "quantity": str(item.quantity or 0),
            }
        )

    return {
        "id": str(challan.id),
        "reference_no": challan.reference_no,
        "vendor_id": str(challan.vendor_id),
        "warehouse_id": str(challan.warehouse_id),
        "rack_id": str(challan.rack_id) if challan.rack_id else None,
        "items": item_rows,
    }


@router.patch("/purchase-challans/{purchase_challan_id}", dependencies=[Depends(require_permission("purchase", "update"))])
async def update_purchase_challan(
    purchase_challan_id: uuid.UUID,
    payload: PurchaseChallanCreate,
    db: AsyncSession = Depends(get_db),
):
    challan = await db.get(PurchaseChallan, purchase_challan_id)
    if challan is None or challan.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase challan not found")

    try:
        await _reverse_purchase_challan_effects(db, challan)
        await db.flush()

        challan.vendor_id = payload.vendor_id
        challan.warehouse_id = payload.warehouse_id
        challan.rack_id = payload.rack_id
        challan.reference_no = payload.reference_no
        challan.status = VoucherStatus.CREATED.value
        await db.flush()

        for index, item in enumerate(payload.items, start=1):
            batch_no = _challan_batch_no(challan.id, index, challan.created_at)
            db.add(
                PurchaseChallanItem(
                    purchase_challan_id=challan.id,
                    product_id=item.product_id,
                    rack_id=payload.rack_id,
                    batch_number=batch_no,
                    expiry_date=item.expiry_date,
                    quantity=item.quantity,
                )
            )
            batch_res = await db.execute(
                select(InventoryBatch).where(
                    InventoryBatch.warehouse_id == payload.warehouse_id,
                    InventoryBatch.product_id == item.product_id,
                    InventoryBatch.batch_no == batch_no,
                )
            )
            batch = batch_res.scalar_one_or_none()
            if batch is None:
                batch = InventoryBatch(
                    warehouse_id=payload.warehouse_id,
                    product_id=item.product_id,
                    batch_no=batch_no,
                    expiry_date=item.expiry_date,
                    available_quantity=Decimal("0"),
                    reserved_quantity=Decimal("0"),
                    damaged_quantity=Decimal("0"),
                )
                db.add(batch)

            batch.available_quantity = Decimal(batch.available_quantity or 0) + Decimal(item.quantity)
            if item.expiry_date:
                batch.expiry_date = item.expiry_date
            db.add(
                StockMovement(
                    warehouse_id=payload.warehouse_id,
                    product_id=item.product_id,
                    batch_no=batch_no,
                    move_type=StockMoveType.IN,
                    quantity=item.quantity,
                    reference_type="purchase_challan",
                    reference_id=challan.id,
                    created_at=datetime.now(timezone.utc),
                )
            )
    except HTTPException:
        await db.rollback()
        raise

    await db.commit()
    await db.refresh(challan)
    return jsonable_encoder(challan)


@router.delete("/purchase-challans/{purchase_challan_id}", dependencies=[Depends(require_permission("purchase", "delete"))])
async def delete_purchase_challan(
    purchase_challan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    challan = await db.get(PurchaseChallan, purchase_challan_id)
    if challan is None or challan.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase challan not found")

    try:
        await _reverse_purchase_challan_effects(db, challan)
        challan.deleted_at = datetime.now(timezone.utc)
        challan.status = VoucherStatus.CANCELLED.value
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise

    return {"id": str(challan.id), "deleted": True}


@router.get("/purchase-bills", dependencies=[Depends(require_permission("purchase", "read"))])
async def list_purchase_bills(db: AsyncSession = Depends(get_db)):
    bills = (
        await db.execute(select(PurchaseBill).where(PurchaseBill.deleted_at.is_(None)).order_by(PurchaseBill.created_at.desc()))
    ).scalars().all()
    response: list[dict] = []
    for bill in bills:
        challan = await db.get(PurchaseChallan, bill.purchase_challan_id) if bill.purchase_challan_id else None
        vendor = await db.get(Vendor, bill.vendor_id) if bill.vendor_id else None
        warehouse = await db.get(Warehouse, bill.warehouse_id) if bill.warehouse_id else None
        item_count = (
            await db.execute(select(PurchaseBillItem).where(PurchaseBillItem.purchase_bill_id == bill.id))
        ).scalars().all()
        response.append(
            {
                "id": str(bill.id),
                "bill_number": bill.bill_number,
                "bill_date": str(bill.bill_date),
                "vendor_id": str(bill.vendor_id) if bill.vendor_id else None,
                "status": bill.status,
                "posted": bill.posted,
                "challan_id": str(bill.purchase_challan_id) if bill.purchase_challan_id else None,
                "challan_reference_no": challan.reference_no if challan else "",
                "vendor_name": vendor.name if vendor else "",
                "warehouse_name": warehouse.name if warehouse else "",
                "entry_mode": "challan" if challan else "direct",
                "item_count": len(item_count),
                "total_amount": str(bill.total_amount or "0"),
            }
        )
    return response


@router.get("/purchase-bills/{purchase_bill_id}", dependencies=[Depends(require_permission("purchase", "read"))])
async def get_purchase_bill(purchase_bill_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    bill = await db.get(PurchaseBill, purchase_bill_id)
    if bill is None or bill.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase bill not found")

    challan = await db.get(PurchaseChallan, bill.purchase_challan_id) if bill.purchase_challan_id else None
    items = (
        await db.execute(
            select(PurchaseBillItem).where(PurchaseBillItem.purchase_bill_id == bill.id).order_by(PurchaseBillItem.id.asc())
        )
    ).scalars().all()

    item_rows: list[dict] = []
    for item in items:
        product = await db.get(Product, item.product_id)
        item_rows.append(
            {
                "id": str(item.id),
                "product_id": str(item.product_id),
                "sku": product.sku if product else "",
                "name": product.name if product else "",
                "batch_no": item.batch_no,
                "expiry_date": str(item.expiry_date) if item.expiry_date else "",
                "quantity": str(item.quantity or 0),
                "damaged_quantity": str(item.damaged_quantity or 0),
                "unit_price": str(item.unit_price or 0),
                "discount_percent": str(item.discount_percent or 0),
                "line_discount_amount": str(item.line_discount_amount or 0),
            }
        )

    return {
        "id": str(bill.id),
        "bill_number": bill.bill_number,
        "bill_date": str(bill.bill_date),
        "vendor_id": str(bill.vendor_id) if bill.vendor_id else None,
        "warehouse_id": str(bill.warehouse_id) if bill.warehouse_id else None,
        "rack_id": str(bill.rack_id) if bill.rack_id else None,
        "challan_id": str(bill.purchase_challan_id) if bill.purchase_challan_id else None,
        "challan_reference_no": challan.reference_no if challan else "",
        "entry_mode": "challan" if challan else "direct",
        "items": item_rows,
    }


@router.get("/stock-snapshot", dependencies=[Depends(require_permission("stock", "read"))])
async def list_stock_snapshot(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    limit: int | None = Query(None, ge=1, le=settings.pagination_max_page_size),
    cursor: str | None = Query(None),
    search: str | None = Query(None),
    warehouse_id: str | None = Query(None),
    include_total: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    use_cursor_mode = limit is not None or cursor is not None
    stmt = (
        select(
            InventoryBatch.id.label("batch_id"),
            InventoryBatch.batch_no.label("batch_no"),
            InventoryBatch.expiry_date.label("expiry_date"),
            InventoryBatch.available_quantity.label("available_quantity"),
            InventoryBatch.reserved_quantity.label("reserved_quantity"),
            InventoryBatch.damaged_quantity.label("damaged_quantity"),
            InventoryBatch.created_at.label("created_at"),
            Product.id.label("product_id"),
            Product.sku.label("sku"),
            Product.name.label("product_name"),
            Product.unit.label("unit"),
            Warehouse.id.label("warehouse_id"),
            Warehouse.code.label("warehouse_code"),
            Warehouse.name.label("warehouse_name"),
        )
        .select_from(InventoryBatch)
        .join(Product, Product.id == InventoryBatch.product_id)
        .join(Warehouse, Warehouse.id == InventoryBatch.warehouse_id)
    )
    count_stmt = (
        select(func.count())
        .select_from(InventoryBatch)
        .join(Product, Product.id == InventoryBatch.product_id)
        .join(Warehouse, Warehouse.id == InventoryBatch.warehouse_id)
    )

    if warehouse_id:
        try:
            stmt = stmt.where(InventoryBatch.warehouse_id == uuid.UUID(warehouse_id))
            count_stmt = count_stmt.where(InventoryBatch.warehouse_id == uuid.UUID(warehouse_id))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid warehouse_id") from exc

    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.sku.ilike(q),
                Product.name.ilike(q),
                InventoryBatch.batch_no.ilike(q),
                Warehouse.name.ilike(q),
                Warehouse.code.ilike(q),
            )
        )
        count_stmt = count_stmt.where(
            or_(
                Product.sku.ilike(q),
                Product.name.ilike(q),
                InventoryBatch.batch_no.ilike(q),
                Warehouse.name.ilike(q),
                Warehouse.code.ilike(q),
            )
        )

    stmt = stmt.order_by(InventoryBatch.created_at.desc(), InventoryBatch.id.desc())

    if not use_cursor_mode:
        total = (await db.execute(count_stmt)).scalar_one()
        paged = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(paged)).mappings().all()
        items = [dict(row) for row in rows]
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        return {
            "items": jsonable_encoder(items),
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    resolved_limit = limit or 50
    cursor_created_at: datetime | None = None
    cursor_batch_id: uuid.UUID | None = None
    if cursor:
        cursor_created_at, cursor_batch_id = _decode_stock_cursor(cursor)
        stmt = stmt.where(
            or_(
                InventoryBatch.created_at < cursor_created_at,
                and_(InventoryBatch.created_at == cursor_created_at, InventoryBatch.id < cursor_batch_id),
            )
        )

    total: int | None = None
    if include_total:
        total = (await db.execute(count_stmt)).scalar_one()

    rows = (await db.execute(stmt.limit(resolved_limit + 1))).mappings().all()
    has_more = len(rows) > resolved_limit
    page_rows = rows[:resolved_limit]
    items = [dict(row) for row in page_rows]

    next_cursor: str | None = None
    if has_more and page_rows:
        last = page_rows[-1]
        last_created_at = last.get("created_at")
        last_batch_id = last.get("batch_id")
        if isinstance(last_created_at, datetime) and last_batch_id is not None:
            next_cursor = _encode_stock_cursor(last_created_at, str(last_batch_id))

    return {
        "items": jsonable_encoder(items),
        "total": total,
        "limit": resolved_limit,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


@router.post("/purchase-bills", dependencies=[Depends(require_permission("purchase", "create"))])
async def create_purchase_bill(
    payload: PurchaseBillCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db, idempotency_key, "procurement:create_purchase_bill", payload.model_dump(mode="json")
    )
    if replay_body is not None:
        return replay_body
    bill = await _create_purchase_bill_internal(db, payload)
    await db.flush()
    try:
        await post_vendor_purchase_bill_payable(db, bill)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await db.commit()
    await db.refresh(bill)
    response = jsonable_encoder(bill)
    await idempotency_store_response(
        db, idempotency_key, "procurement:create_purchase_bill", req_hash, replay_code or 201, response
    )
    return response


@router.patch("/purchase-bills/{purchase_bill_id}", dependencies=[Depends(require_permission("purchase", "update"))])
async def update_purchase_bill(
    purchase_bill_id: uuid.UUID,
    payload: PurchaseBillUpdate,
    db: AsyncSession = Depends(get_db),
):
    bill = await db.get(PurchaseBill, purchase_bill_id)
    if bill is None or bill.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase bill not found")

    try:
        await _reverse_purchase_bill_effects(db, bill)
        await db.flush()
        await _create_purchase_bill_internal(db, payload, existing_bill=bill)
        await db.flush()
        await post_vendor_purchase_bill_payable(db, bill)
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await db.commit()
    await db.refresh(bill)
    return jsonable_encoder(bill)


@router.delete("/purchase-bills/{purchase_bill_id}", dependencies=[Depends(require_permission("purchase", "delete"))])
async def delete_purchase_bill(
    purchase_bill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    bill = await db.get(PurchaseBill, purchase_bill_id)
    if bill is None or bill.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase bill not found")

    try:
        await _reverse_purchase_bill_effects(db, bill)
        bill.deleted_at = datetime.now(timezone.utc)
        bill.status = VoucherStatus.CANCELLED.value
        bill.posted = False
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise

    return {"id": str(bill.id), "deleted": True}


@router.get("/purchase-entry/bootstrap", dependencies=[Depends(require_permission("purchase", "read"))], response_model=PurchaseEntryBootstrap)
async def purchase_entry_bootstrap(db: AsyncSession = Depends(get_db)):
    warehouses = (
        await db.execute(select(Warehouse).where(Warehouse.is_active.is_(True)).order_by(Warehouse.name.asc()))
    ).scalars().all()
    return PurchaseEntryBootstrap(
        today=datetime.now(timezone.utc).date(),
        next_entry_number=_purchase_entry_number(),
        default_warehouse_id=warehouses[0].id if warehouses else None,
        warehouses=[{"id": warehouse.id, "name": warehouse.name, "code": warehouse.code} for warehouse in warehouses],
    )


@router.get("/purchase-entry/vendors/search", dependencies=[Depends(require_permission("purchase", "read"))])
async def search_purchase_entry_vendors(
    q: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Vendor).where(Vendor.is_active.is_(True))
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Vendor.name.ilike(term), Vendor.firm_name.ilike(term), Vendor.city.ilike(term), Vendor.gstin.ilike(term)))
    stmt = stmt.order_by(Vendor.name.asc()).limit(limit)
    vendors = (await db.execute(stmt)).scalars().all()
    summaries = []
    for vendor in vendors:
        summary = await _build_vendor_summary(db, vendor)
        summaries.append(jsonable_encoder(summary))
    return {"items": summaries}


@router.get("/purchase-entry/vendors/{vendor_id}/summary", dependencies=[Depends(require_permission("purchase", "read"))], response_model=PurchaseEntryVendorSummary)
async def get_purchase_entry_vendor_summary(vendor_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    vendor = await db.get(Vendor, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return await _build_vendor_summary(db, vendor)


@router.get("/purchase-entry/products/search", dependencies=[Depends(require_permission("purchase", "read"))])
async def search_purchase_entry_products(
    q: str | None = Query(None),
    vendor_id: uuid.UUID | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Product)
        .select_from(Product)
        .outerjoin(ProductBrand, ProductBrand.id == Product.brand_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
        .outerjoin(ProductSubCategory, ProductSubCategory.id == Product.sub_category_id)
        .where(Product.is_active.is_(True))
    )
    if vendor_id is not None:
        linked_brand_rows = (
            await db.execute(
                select(VendorBrand.brand_id, ProductBrand.name)
                .join(ProductBrand, ProductBrand.id == VendorBrand.brand_id)
                .where(
                    VendorBrand.vendor_id == vendor_id,
                    VendorBrand.is_active.is_(True),
                )
            )
        ).all()
        linked_brand_ids = [row[0] for row in linked_brand_rows if row[0] is not None]
        linked_brand_names = [str(row[1]).strip() for row in linked_brand_rows if row[1]]
        if not linked_brand_ids and not linked_brand_names:
            return {"items": []}
        brand_filters = []
        if linked_brand_ids:
            brand_filters.append(Product.brand_id.in_(linked_brand_ids))
        if linked_brand_names:
            brand_filters.append(func.upper(func.trim(Product.brand)).in_([name.upper() for name in linked_brand_names]))
        stmt = stmt.where(or_(*brand_filters))
    ranking = None
    if q and q.strip():
        term = q.strip()
        like_term = f"%{term}%"
        prefix_term = f"{term}%"
        stmt = stmt.where(
            or_(
                Product.sku.ilike(like_term),
                Product.name.ilike(like_term),
                Product.display_name.ilike(like_term),
                Product.brand.ilike(like_term),
                Product.category.ilike(like_term),
                Product.description.ilike(like_term),
                ProductBrand.name.ilike(like_term),
                ProductCategory.name.ilike(like_term),
                ProductSubCategory.name.ilike(like_term),
            )
        )
        ranking = case(
            (Product.sku.ilike(term), 0),
            (Product.sku.ilike(prefix_term), 1),
            (Product.name.ilike(prefix_term), 2),
            (Product.display_name.ilike(prefix_term), 3),
            (ProductBrand.name.ilike(prefix_term), 4),
            (ProductCategory.name.ilike(prefix_term), 5),
            else_=6,
        )
    if ranking is not None:
        stmt = stmt.order_by(ranking.asc(), Product.created_at.desc())
    else:
        stmt = stmt.order_by(Product.created_at.desc())
    stmt = stmt.limit(limit)
    products = (await db.execute(stmt)).scalars().all()
    items = []
    for product in products:
        items.append(jsonable_encoder(await _build_product_summary(db, product)))
    return {"items": items}


@router.get("/purchase-entry/products/{product_id}/summary", dependencies=[Depends(require_permission("purchase", "read"))], response_model=PurchaseEntryProductSummary)
async def get_purchase_entry_product_summary(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return await _build_product_summary(db, product)


@router.post("/purchase-entry", dependencies=[Depends(require_permission("purchase", "create"))])
async def create_purchase_entry(
    payload: PurchaseBillCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db, idempotency_key, "procurement:create_purchase_entry", payload.model_dump(mode="json")
    )
    if replay_body is not None:
        return replay_body

    bill = await _create_purchase_bill_internal(db, payload)
    await db.flush()
    try:
        await post_vendor_purchase_bill_payable(db, bill)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await db.commit()
    await db.refresh(bill)
    response = jsonable_encoder(bill)
    await idempotency_store_response(
        db, idempotency_key, "procurement:create_purchase_entry", req_hash, replay_code or 201, response
    )
    return response


@router.post("/purchase-bills/{purchase_bill_id}/post", dependencies=[Depends(require_permission("purchase", "update"))])
async def post_bill(
    purchase_bill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db,
        idempotency_key,
        "procurement:post_purchase_bill",
        {"purchase_bill_id": str(purchase_bill_id)},
    )
    if replay_body is not None:
        return replay_body

    try:
        bill = await post_purchase_bill(db, purchase_bill_id)
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_400_BAD_REQUEST if "Invalid status transition" in message else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message) from exc
    response = {"id": str(bill.id), "posted": bill.posted}
    await idempotency_store_response(
        db, idempotency_key, "procurement:post_purchase_bill", req_hash, replay_code or 200, response
    )
    return response


@router.post("/purchase-returns", dependencies=[Depends(require_permission("purchase", "create"))])
async def create_purchase_return(payload: PurchaseReturnCreate, db: AsyncSession = Depends(get_db)):
    row = PurchaseReturn(
        vendor_id=payload.vendor_id,
        warehouse_id=payload.warehouse_id,
        return_date=payload.return_date,
        reason=payload.reason,
        status=VoucherStatus.CREATED.value,
    )
    db.add(row)
    await db.flush()
    for item in payload.items:
        db.add(PurchaseReturnItem(purchase_return_id=row.id, **item.model_dump()))
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/purchase-returns", dependencies=[Depends(require_permission("purchase", "read"))])
async def list_purchase_returns(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(PurchaseReturn).where(PurchaseReturn.deleted_at.is_(None)))).scalars().all()


@router.post("/purchase-expiries", dependencies=[Depends(require_permission("purchase", "create"))])
async def create_purchase_expiry(payload: PurchaseExpiryCreate, db: AsyncSession = Depends(get_db)):
    row = PurchaseExpiry(
        vendor_id=payload.vendor_id,
        warehouse_id=payload.warehouse_id,
        expiry_date=payload.expiry_date,
        reason=payload.reason,
        status=VoucherStatus.CREATED.value,
    )
    db.add(row)
    await db.flush()
    for item in payload.items:
        db.add(PurchaseExpiryItem(purchase_expiry_id=row.id, **item.model_dump()))
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/purchase-expiries", dependencies=[Depends(require_permission("purchase", "read"))])
async def list_purchase_expiries(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(PurchaseExpiry).where(PurchaseExpiry.deleted_at.is_(None)))).scalars().all()


@router.post("/warehouse-transfers", dependencies=[Depends(require_permission("stock", "create"))])
async def create_warehouse_transfer(payload: WarehouseTransferCreate, db: AsyncSession = Depends(get_db)):
    if payload.from_warehouse_id == payload.to_warehouse_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from_warehouse_id and to_warehouse_id must differ")
    row = WarehouseTransfer(
        from_warehouse_id=payload.from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        status=VoucherStatus.CREATED.value,
    )
    db.add(row)
    await db.flush()
    for item in payload.items:
        db.add(WarehouseTransferItem(transfer_id=row.id, **item.model_dump()))
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/warehouse-transfers", dependencies=[Depends(require_permission("stock", "read"))])
async def list_warehouse_transfers(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(WarehouseTransfer).where(WarehouseTransfer.deleted_at.is_(None)))).scalars().all()


@router.post("/reorder-logs", dependencies=[Depends(require_permission("stock", "create"))])
async def create_reorder_log(payload: ReorderLogCreate, db: AsyncSession = Depends(get_db)):
    row = ReorderLog(
        brand=payload.brand,
        warehouse_scope=payload.warehouse_scope,
        warehouse_id=payload.warehouse_id,
        days=payload.days,
        grace_days=payload.grace_days,
        strategy=payload.strategy,
        created_by=payload.created_by,
    )
    db.add(row)
    await db.flush()
    for item in payload.items:
        db.add(ReorderItem(reorder_id=row.id, **item.model_dump()))
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/reorder-logs", dependencies=[Depends(require_permission("stock", "read"))])
async def list_reorder_logs(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(ReorderLog))).scalars().all()
