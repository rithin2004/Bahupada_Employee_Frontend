import base64
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.entities import (
    InventoryBatch,
    Product,
    PurchaseBill,
    PurchaseBillItem,
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
    Vendor,
    VoucherStatus,
    Warehouse,
    WarehouseTransfer,
    WarehouseTransferItem,
)
from app.schemas.procurement import (
    PurchaseBillCreate,
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


@router.post("/purchase-challans")
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


@router.get("/purchase-challans")
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


@router.get("/purchase-bills")
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
                "status": bill.status,
                "posted": bill.posted,
                "challan_id": str(bill.purchase_challan_id) if bill.purchase_challan_id else None,
                "challan_reference_no": challan.reference_no if challan else "",
                "vendor_name": vendor.name if vendor else "",
                "warehouse_name": warehouse.name if warehouse else "",
                "entry_mode": "challan" if challan else "direct",
                "item_count": len(item_count),
            }
        )
    return response


@router.get("/stock-snapshot")
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
            Product.base_price.label("base_price"),
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


@router.post("/purchase-bills")
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
        if await db.get(Vendor, vendor_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        if await db.get(Warehouse, warehouse_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found")
    remaining_challan_qty = dict(challan_qty_by_product)

    bill = PurchaseBill(
        purchase_challan_id=payload.challan_id,
        vendor_id=vendor_id,
        warehouse_id=warehouse_id,
        rack_id=rack_id,
        bill_number=payload.bill_number,
        bill_date=payload.bill_date,
        subtotal=Decimal("0"),
        total_amount=Decimal("0"),
        status=VoucherStatus.POSTED.value,
        posted=True,
    )
    db.add(bill)
    await db.flush()
    total_amount = Decimal("0")

    for item in payload.items:
        if item.damaged_quantity < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="damaged_quantity cannot be negative")
        received_qty = Decimal(item.quantity)
        damaged_qty = Decimal(item.damaged_quantity)
        if damaged_qty > received_qty:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="damaged_quantity cannot exceed quantity")
        total_amount += received_qty * Decimal(item.unit_price)

        db.add(
            PurchaseBillItem(
                purchase_bill_id=bill.id,
                product_id=item.product_id,
                batch_no=item.batch_no,
                expiry_date=item.expiry_date,
                quantity=received_qty,
                damaged_quantity=damaged_qty,
                unit_price=item.unit_price,
            )
        )

        final_available = received_qty - damaged_qty
        if challan is not None:
            baseline = remaining_challan_qty.get(item.product_id, Decimal("0"))
            allocated_baseline = baseline if baseline <= received_qty else received_qty
            remaining_challan_qty[item.product_id] = baseline - allocated_baseline
            delta_available = final_available - allocated_baseline
        else:
            delta_available = final_available

        batch_res = await db.execute(
            select(InventoryBatch).where(
                InventoryBatch.warehouse_id == warehouse_id,
                InventoryBatch.product_id == item.product_id,
                InventoryBatch.batch_no == item.batch_no,
            )
        )
        batch = batch_res.scalar_one_or_none()
        if batch is None:
            batch = InventoryBatch(
                warehouse_id=warehouse_id,
                product_id=item.product_id,
                batch_no=item.batch_no,
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
                    batch_no=item.batch_no,
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
                    batch_no=item.batch_no,
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
                    batch_no=item.batch_no,
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

    bill.subtotal = total_amount
    bill.total_amount = total_amount
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


@router.post("/purchase-bills/{purchase_bill_id}/post")
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


@router.post("/purchase-returns")
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


@router.get("/purchase-returns")
async def list_purchase_returns(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(PurchaseReturn).where(PurchaseReturn.deleted_at.is_(None)))).scalars().all()


@router.post("/purchase-expiries")
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


@router.get("/purchase-expiries")
async def list_purchase_expiries(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(PurchaseExpiry).where(PurchaseExpiry.deleted_at.is_(None)))).scalars().all()


@router.post("/warehouse-transfers")
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


@router.get("/warehouse-transfers")
async def list_warehouse_transfers(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(WarehouseTransfer).where(WarehouseTransfer.deleted_at.is_(None)))).scalars().all()


@router.post("/reorder-logs")
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


@router.get("/reorder-logs")
async def list_reorder_logs(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(ReorderLog))).scalars().all()
