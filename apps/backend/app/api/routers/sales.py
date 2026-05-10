import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json

from fastapi import APIRouter, Depends, Header, Query
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy import delete, func, or_, select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.auth import require_any_portal, require_employee_or_admin_portal, require_permission
from app.db.session import get_db
from app.utils.line_items import raise_if_duplicate_line_products
from app.models.entities import (
    AuditLog,
    CreditNote,
    Customer,
    DebitNote,
    Employee,
    InvoiceVersion,
    OrderSource,
    PackingTask,
    Product,
    SalesFinalInvoice,
    SalesFinalInvoiceItem,
    SalesExpiry,
    SalesExpiryItem,
    SalesOrder,
    SalesOrderReservation,
    SalesOrderItem,
    Warehouse,
    SalesReturn,
    SalesReturnItem,
    Payment,
    VoucherStatus,
    PartyLedgerEntryKind,
    PaymentFlowDirection,
    PartyType,
    Pricing,
    HSNMaster,
    InventoryBatch,
    StockMovement,
    Unit,
)
from app.schemas.sales import (
    SalesEntryProductSummary,
    RecentSalesBill,
    CustomerPendingSalesOrderSummary,
    PendingOrdersDashboardResponse,
    SalesEntryCustomerSummary,
    SalesEntryPendingCustomer,
    SalesEntryRecentInvoice,
    SalesEntryRecentReceipt,
    SalesEntryBootstrap,
    SalesExpiryCreate,
    SalesFinalInvoiceCreate,
    SalesFinalInvoiceFromOrderCreate,
    SalesFinalInvoiceEditRequest,
    SalesFinalInvoiceItemIn,
    SalesDirectBillCreate,
    SalesOrderPrepareCreate,
    SalesOrderCreate,
    SalesOrderPreviewResponse,
    SalesReturnCreate,
)
from app.schemas.auth import AuthUserInfo
from app.schemas.finance import (
    CustomerIncomingPaymentForAllocation,
    PartyLedgerPaymentCreate,
    PartyLedgerStatementResponse,
    SalesInvoiceAllocationsAppend,
    SalesInvoiceForReceiptAllocation,
)
from app.services.idempotency import idempotency_precheck, idempotency_store_response
from app.services.finance import (
    add_sales_invoice_allocations_to_existing_party_payment,
    get_party_ledger_statement,
    list_customer_incoming_party_payments_for_invoice_allocation,
    list_customer_sales_invoices_for_receipt_allocation,
    post_customer_sales_invoice_receivable,
    post_party_ledger_entry,
    record_party_payment,
)
from app.services.pricing import resolve_price_for_customer
from app.services.schemes import (
    apply_schemes_to_sales_order,
    build_sales_order_preview,
    serialize_scheme_for_sales_popup,
    split_schemes_for_product_line,
)
from app.services.stock import (
    consume_reserved_stock_for_final_invoice,
    consume_reserved_stock_for_final_invoice_quantities,
    release_reserved_stock_for_sales_order,
    reserve_stock_fefo_for_sales_order,
)
from app.services.workflow import assert_voucher_transition

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))


def _sales_entry_number(now: datetime | None = None) -> str:
    ts = (now or datetime.now(IST)).astimezone(IST)
    return f"S{ts.strftime('%y%m%d%H%M%S')}"


def _split_inclusive_tax(inclusive_amount: Decimal, gst_percent: Decimal) -> tuple[Decimal, Decimal]:
    if gst_percent <= 0:
        return inclusive_amount, Decimal("0")
    base_amount = inclusive_amount / (Decimal("1") + (gst_percent / Decimal("100")))
    return base_amount, inclusive_amount - base_amount


def _normalize_unit_ratio(base_quantity: Decimal, conv_2_to_1: Decimal | None, conv_3_to_1: Decimal | None) -> tuple[str, dict[str, Decimal]]:
    q = base_quantity
    c3 = conv_3_to_1 or Decimal("0")
    c2 = conv_2_to_1 or Decimal("0")
    
    parts = []
    ratios = {}
    
    if c3 > 0:
        val = int(q // c3)
        if val > 0:
            parts.append(f"{val} (3rd)")
            ratios["3rd"] = Decimal(val)
            q %= c3
            
    if c2 > 0:
        val = int(q // c2)
        if val > 0:
            parts.append(f"{val} (2nd)")
            ratios["2nd"] = Decimal(val)
            q %= c2
            
    if q > 0 or not parts:
        parts.append(f"{float(q):.2f} (1st)")
        ratios["1st"] = q
        
    return " + ".join(parts), ratios


async def _unit_name(db: AsyncSession, unit_id: uuid.UUID | None) -> str | None:
    if not unit_id:
        return None
    unit = await db.get(Unit, unit_id)
    return unit.unit_code if unit else None


async def _build_sales_product_summary(db: AsyncSession, product: Product) -> SalesEntryProductSummary:
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
                SalesFinalInvoiceItem.selling_price,
                SalesFinalInvoiceItem.discount_percent,
                SalesFinalInvoice.invoice_number,
                SalesFinalInvoice.invoice_date,
                SalesFinalInvoiceItem.total_amount,
                SalesFinalInvoiceItem.quantity,
            )
            .join(SalesFinalInvoice, SalesFinalInvoice.id == SalesFinalInvoiceItem.sales_final_invoice_id)
            .where(SalesFinalInvoiceItem.product_id == product.id, SalesFinalInvoice.deleted_at.is_(None))
            .order_by(SalesFinalInvoice.invoice_date.desc(), SalesFinalInvoice.created_at.desc(), SalesFinalInvoiceItem.id.desc())
            .limit(5)
        )
    ).all()

    conv2 = Decimal(product.conv_2_to_1 or 0)
    conv3 = Decimal(product.conv_3_to_1 or 0)
    stock_ratio, _ = _normalize_unit_ratio(Decimal(stock_total or 0), conv2, conv3)
    
    # Check if product has any transactions (stock movements)
    has_interactions = (
        await db.execute(
            select(exists().where(StockMovement.product_id == product.id))
        )
    ).scalar()

    return SalesEntryProductSummary(
        product_id=product.id,
        sku=product.sku,
        name=product.name,
        brand=product.brand,
        category=product.category,
        sub_category=product.sub_category,
        description=product.description,
        hsn_code=hsn.hsn_code if hsn else None,
        tax_percent=Decimal(product.tax_percent or 0),
        mrp=Decimal(pricing.mrp if pricing else 0),
        selling_price=Decimal(pricing.a_class_price if pricing else 0),
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
        latest_rate_unit_level=1, # Defaulting to 1 as SalesFinalInvoiceItem lacks this column
        latest_discount_percent=Decimal(latest_line[0][1] or 0) if latest_line else None,
        has_interactions=bool(has_interactions),
        recent_bills=[
            {
                "bill_number": row[2],
                "bill_date": row[3],
                "line_total_amount": Decimal(row[4] or 0),
                "quantity": Decimal(row[5] or 0),
                "mrp": Decimal(pricing.mrp if pricing else 0),
                "rate_value": Decimal(row[0] or 0),
                "discount_percent": Decimal(row[1] or 0),
                "unit_name": await _unit_name(db, product.primary_unit_id) # Sales items usually stored in base unit
            }
            for row in latest_line
        ]
    )


@router.get("/sales-entry/products/{product_id}/summary", response_model=SalesEntryProductSummary, dependencies=[Depends(require_permission("sales", "read"))])
async def get_sales_entry_product_summary(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return await _build_sales_product_summary(db, product)


@router.get("/sales-entry/products/search", dependencies=[Depends(require_permission("sales", "read"))])
async def search_sales_entry_products(
    q: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Product).where(Product.is_active.is_(True))
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.sku.ilike(term),
                Product.name.ilike(term),
                Product.display_name.ilike(term),
                Product.brand.ilike(term),
            )
        )
    stmt = stmt.order_by(Product.name.asc()).limit(limit)
    products = (await db.execute(stmt)).scalars().all()
    items = [jsonable_encoder(await _build_sales_product_summary(db, p)) for p in products]
    return {"items": items}


@router.get("/sales-entry/products/{product_id}/resolved-price", dependencies=[Depends(require_permission("sales", "read"))])
async def get_sales_entry_resolved_price(
    product_id: uuid.UUID,
    customer_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    unit_price, source = await resolve_price_for_customer(db, customer, product)
    return {"unit_price": str(unit_price), "source": source}


@router.get(
    "/sales-entry/customers/{customer_id}/ledger",
    response_model=PartyLedgerStatementResponse,
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def get_sales_entry_customer_ledger(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await get_party_ledger_statement(db, party_type=PartyType.CUSTOMER, party_id=customer_id)
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get(
    "/sales-entry/schemes/available",
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def sales_entry_schemes_available(
    product_id: uuid.UUID = Query(...),
    customer_id: uuid.UUID = Query(...),
    as_of_date: date | None = Query(None, description="Bill / order date; defaults to today"),
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_any_portal),
):
    """Schemes active for the customer on the given date: those whose product scope matches the line, vs all other active schemes."""
    if auth.portal == "CUSTOMER" and auth.customer_id != str(customer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access denied")
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    product = await db.get(Product, product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    target = as_of_date or date.today()
    matching, other = await split_schemes_for_product_line(db, customer=customer, product=product, as_of_date=target)
    # Serialize in parallel — sequential await per scheme was N round-trips and felt slow in the UI.
    for_product = (
        await asyncio.gather(*[serialize_scheme_for_sales_popup(db, s) for s in matching]) if matching else []
    )
    other_active = (
        await asyncio.gather(*[serialize_scheme_for_sales_popup(db, s) for s in other]) if other else []
    )
    return {
        "for_product": list(for_product),
        "other_active": list(other_active),
    }


@router.post("/sales-orders/preview", response_model=SalesOrderPreviewResponse, dependencies=[Depends(require_permission("sales", "read"))])
async def preview_sales_order(
    payload: SalesOrderCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_any_portal),
):
    if auth.portal == "CUSTOMER" and auth.customer_id != str(payload.customer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access denied")

    customer = await db.get(Customer, payload.customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    raise_if_duplicate_line_products(payload.items)

    preview_items = await build_sales_order_preview(
        db,
        customer=customer,
        warehouse_id=payload.warehouse_id,
        items=[(item.product_id, Decimal(item.quantity)) for item in payload.items],
    )

    subtotal = Decimal("0")
    final_total = Decimal("0")
    response_items: list[dict[str, object]] = []
    for item in preview_items:
        line_subtotal = Decimal(item.unit_price) * Decimal(item.quantity)
        line_total = Decimal(item.selling_price) * Decimal(item.quantity)
        subtotal += line_subtotal
        final_total += line_total
        response_items.append(
            {
                "product_id": item.product_id,
                "sku": item.sku,
                "product_name": item.product_name,
                "unit": item.unit,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "selling_price": item.selling_price,
                "discount_percent": item.discount_percent,
                "is_free_item": item.is_free_item,
            }
        )

    return {
        "items": response_items,
        "subtotal": subtotal,
        "final_total": final_total,
    }


@router.post("/sales-orders", dependencies=[Depends(require_permission("sales", "create"))])
async def create_sales_order(
    payload: SalesOrderCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
    auth: AuthUserInfo = Depends(require_any_portal),
):
    if auth.portal == "CUSTOMER" and auth.customer_id != str(payload.customer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access denied")
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db, idempotency_key, "sales:create_sales_order", payload.model_dump(mode="json")
    )
    if replay_body is not None:
        return replay_body

    customer = await db.get(Customer, payload.customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    raise_if_duplicate_line_products(payload.items)

    if auth.portal == "CUSTOMER":
        order_source = OrderSource.CUSTOMER
    elif payload.source == OrderSource.SALESMAN:
        order_source = OrderSource.SALESMAN
    else:
        order_source = OrderSource.ADMIN

    invoice_number = payload.invoice_number.strip() if payload.invoice_number and payload.invoice_number.strip() else None
    if invoice_number is None:
        invoice_number = f"SO-{datetime.now(IST).strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:6].upper()}"

    order = SalesOrder(
        warehouse_id=payload.warehouse_id,
        customer_id=payload.customer_id,
        salesman_id=auth.employee_id if order_source == OrderSource.SALESMAN and auth.employee_id else None,
        invoice_number=invoice_number,
        source=order_source,
        status="pending",
    )
    db.add(order)
    await db.flush()

    for item in payload.items:
        product = await db.get(Product, item.product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        unit_price, _source = await resolve_price_for_customer(db, customer, product)
        db.add(
            SalesOrderItem(
                sales_order_id=order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=unit_price,
                selling_price=unit_price,
                gst_percent=product.tax_percent,
            )
        )

    await db.flush()
    try:
        await apply_schemes_to_sales_order(db, order, customer)
        await db.flush()
        await release_reserved_stock_for_sales_order(db, order)
        await reserve_stock_fefo_for_sales_order(
            db,
            order,
            allow_negative_override=True,
            override_reason="AUTO_NEGATIVE_OVERRIDE",
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invoice_number already exists") from exc
    await db.refresh(order)
    response = jsonable_encoder(order)
    await idempotency_store_response(
        db, idempotency_key, "sales:create_sales_order", req_hash, replay_code or 201, response
    )
    return response


@router.patch("/sales-orders/{sales_order_id}", dependencies=[Depends(require_permission("sales", "update"))])
async def update_sales_order(
    sales_order_id: uuid.UUID,
    payload: SalesOrderCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_any_portal),
):
    order = await db.get(SalesOrder, sales_order_id)
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales order not found")

    inv_exists = (
        await db.execute(
            select(func.count())
            .select_from(SalesFinalInvoice)
            .where(
                SalesFinalInvoice.sales_order_id == order.id,
                SalesFinalInvoice.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    if int(inv_exists or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit sales order after a final invoice exists",
        )

    customer = await db.get(Customer, payload.customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    if auth.portal == "CUSTOMER" and auth.customer_id != str(payload.customer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access denied")

    if auth.portal == "CUSTOMER":
        order_source = OrderSource.CUSTOMER
    elif payload.source == OrderSource.SALESMAN:
        order_source = OrderSource.SALESMAN
    else:
        order_source = OrderSource.ADMIN

    invoice_number = payload.invoice_number.strip() if payload.invoice_number and payload.invoice_number.strip() else None
    if invoice_number is None:
        invoice_number = f"SO-{datetime.now(IST).strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:6].upper()}"

    raise_if_duplicate_line_products(payload.items)

    try:
        await release_reserved_stock_for_sales_order(db, order)
        await db.execute(delete(SalesOrderItem).where(SalesOrderItem.sales_order_id == order.id))
        await db.flush()

        order.warehouse_id = payload.warehouse_id
        order.customer_id = payload.customer_id
        order.invoice_number = invoice_number
        order.source = order_source
        order.salesman_id = auth.employee_id if order_source == OrderSource.SALESMAN and auth.employee_id else None
        order.status = "pending"

        for item in payload.items:
            product = await db.get(Product, item.product_id)
            if product is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
            unit_price, _source = await resolve_price_for_customer(db, customer, product)
            db.add(
                SalesOrderItem(
                    sales_order_id=order.id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    unit_price=unit_price,
                    selling_price=unit_price,
                )
            )

        await db.flush()
        await apply_schemes_to_sales_order(db, order, customer)
        await db.flush()
        await release_reserved_stock_for_sales_order(db, order)
        await reserve_stock_fefo_for_sales_order(
            db,
            order,
            allow_negative_override=True,
            override_reason="AUTO_NEGATIVE_OVERRIDE",
        )
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invoice_number already exists") from exc
    await db.refresh(order)
    return jsonable_encoder(order)


@router.get("/sales-orders", dependencies=[Depends(require_permission("sales", "read"))])
async def list_sales_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    open_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    clean_search = search.strip() if search else ""
    has_search = bool(clean_search)
    base_stmt = (
        select(
            SalesOrder.id.label("id"),
            SalesOrder.invoice_number.label("invoice_number"),
            SalesOrder.source.label("source"),
            SalesOrder.status.label("status"),
            SalesOrder.created_at.label("created_at"),
            SalesOrder.customer_id.label("customer_id"),
            SalesOrder.warehouse_id.label("warehouse_id"),
            Customer.name.label("customer_name"),
            Warehouse.name.label("warehouse_name"),
        )
        .select_from(SalesOrder)
        .join(Customer, Customer.id == SalesOrder.customer_id)
        .join(Warehouse, Warehouse.id == SalesOrder.warehouse_id)
        .where(SalesOrder.deleted_at.is_(None))
    )

    if open_only:
        base_stmt = base_stmt.where(SalesOrder.status == "pending")

    if has_search:
        q = f"%{clean_search}%"
        base_stmt = base_stmt.where(
            or_(
                SalesOrder.invoice_number.ilike(q),
                Customer.name.ilike(q),
                Warehouse.name.ilike(q),
            )
        )

    stmt = base_stmt.order_by(SalesOrder.created_at.desc())

    # Use a lightweight count path instead of counting grouped/ordered projections.
    if has_search:
        q = f"%{clean_search}%"
        total_stmt = (
            select(func.count(func.distinct(SalesOrder.id)))
            .select_from(SalesOrder)
            .join(Customer, Customer.id == SalesOrder.customer_id)
            .join(Warehouse, Warehouse.id == SalesOrder.warehouse_id)
            .where(SalesOrder.deleted_at.is_(None))
            .where(
                or_(
                    SalesOrder.invoice_number.ilike(q),
                    Customer.name.ilike(q),
                    Warehouse.name.ilike(q),
                )
            )
        )
    else:
        total_stmt = select(func.count()).select_from(SalesOrder).where(SalesOrder.deleted_at.is_(None))
    total = (await db.execute(total_stmt)).scalar_one()
    rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).mappings().all()

    order_ids = [row["id"] for row in rows]
    item_count_map: dict[uuid.UUID, int] = {}
    if order_ids:
        counts_stmt = (
            select(SalesOrderItem.sales_order_id, func.count(SalesOrderItem.id))
            .where(SalesOrderItem.sales_order_id.in_(order_ids))
            .group_by(SalesOrderItem.sales_order_id)
        )
        count_rows = (await db.execute(counts_stmt)).all()
        item_count_map = {order_id: int(count) for order_id, count in count_rows}

    items = []
    for row in rows:
        item = dict(row)
        item["item_count"] = item_count_map.get(row["id"], 0)
        items.append(item)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/sales-orders/{sales_order_id}", dependencies=[Depends(require_permission("sales", "read"))])
async def get_sales_order(
    sales_order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    order = await db.get(SalesOrder, sales_order_id)
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales order not found")

    stmt = (
        select(
            SalesOrderItem.id.label("id"),
            SalesOrderItem.product_id.label("product_id"),
            Product.sku.label("sku"),
            Product.name.label("product_name"),
            Product.unit.label("unit"),
            SalesOrderItem.quantity.label("quantity"),
            SalesOrderItem.unit_price.label("unit_price"),
            SalesOrderItem.selling_price.label("selling_price"),
            SalesOrderItem.discount_percent.label("discount_percent"),
            SalesOrderItem.gst_percent.label("gst_percent"),
        )
        .select_from(SalesOrderItem)
        .join(Product, Product.id == SalesOrderItem.product_id)
        .where(SalesOrderItem.sales_order_id == sales_order_id)
        .order_by(Product.name.asc())
    )
    rows = (await db.execute(stmt)).mappings().all()
    
    response = jsonable_encoder(order)
    response["items"] = jsonable_encoder([dict(row) for row in rows])
    return response


@router.get(
    "/customers/{customer_id}/pending-sales-orders",
    response_model=list[CustomerPendingSalesOrderSummary],
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def list_customer_pending_sales_orders(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    orders_stmt = (
        select(
            SalesOrder.id.label("sales_order_id"),
            SalesOrder.invoice_number.label("invoice_number"),
            SalesOrder.warehouse_id.label("warehouse_id"),
            Warehouse.name.label("warehouse_name"),
            SalesOrder.source.label("source"),
            Employee.full_name.label("salesman_name"),
            SalesOrder.status.label("status"),
            SalesOrder.created_at.label("created_at"),
        )
        .select_from(SalesOrder)
        .join(Warehouse, Warehouse.id == SalesOrder.warehouse_id)
        .outerjoin(Employee, Employee.id == SalesOrder.salesman_id)
        .where(
            SalesOrder.customer_id == customer_id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.status == "pending",
        )
        .order_by(SalesOrder.created_at.asc())
    )
    order_rows = (await db.execute(orders_stmt)).mappings().all()
    if not order_rows:
        return []

    order_ids = [row["sales_order_id"] for row in order_rows]
    items_stmt = (
        select(
            SalesOrderItem.sales_order_id.label("sales_order_id"),
            SalesOrderItem.id.label("sales_order_item_id"),
            SalesOrderItem.product_id.label("product_id"),
            Product.sku.label("sku"),
            Product.name.label("product_name"),
            Product.unit.label("unit"),
            SalesOrderItem.quantity.label("quantity"),
            SalesOrderItem.unit_price.label("unit_price"),
            SalesOrderItem.selling_price.label("selling_price"),
            SalesOrderItem.discount_percent.label("discount_percent"),
            SalesOrderItem.is_bundle_child.label("is_free_item"),
        )
        .select_from(SalesOrderItem)
        .join(Product, Product.id == SalesOrderItem.product_id)
        .where(
            SalesOrderItem.sales_order_id.in_(order_ids),
            SalesOrderItem.quantity > 0,
        )
        .order_by(Product.name.asc())
    )
    item_rows = (await db.execute(items_stmt)).mappings().all()
    items_by_order: dict[uuid.UUID, list[dict[str, object]]] = {}
    for row in item_rows:
        items_by_order.setdefault(row["sales_order_id"], []).append(
            {
                "sales_order_item_id": row["sales_order_item_id"],
                "product_id": row["product_id"],
                "sku": row["sku"],
                "product_name": row["product_name"],
                "unit": row["unit"],
                "quantity": row["quantity"],
                "unit_price": row["unit_price"],
                "selling_price": row["selling_price"],
                "discount_percent": row["discount_percent"],
                "is_free_item": bool(row["is_free_item"]),
            }
        )

    response: list[dict[str, object]] = []
    for row in order_rows:
        items = items_by_order.get(row["sales_order_id"], [])
        if not items:
            continue
        response.append(
            {
                "sales_order_id": row["sales_order_id"],
                "invoice_number": row["invoice_number"],
                "warehouse_id": row["warehouse_id"],
                "warehouse_name": row["warehouse_name"],
                "source": row["source"].value if hasattr(row["source"], "value") else str(row["source"]),
                "source_label": row["salesman_name"] or (row["source"].value if hasattr(row["source"], "value") else str(row["source"])),
                "status": row["status"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else "",
                "items": items,
            }
    )
    return response


@router.get("/sales-entry/bootstrap", response_model=SalesEntryBootstrap, dependencies=[Depends(require_permission("sales", "read"))])
async def sales_entry_bootstrap(db: AsyncSession = Depends(get_db)):
    warehouses = (
        await db.execute(select(Warehouse).where(Warehouse.is_active.is_(True)).order_by(Warehouse.name.asc()))
    ).scalars().all()
    return SalesEntryBootstrap(
        today=datetime.now(IST).date(),
        default_warehouse_id=warehouses[0].id if warehouses else None,
        next_entry_number=_sales_entry_number(),
        warehouses=[{"id": warehouse.id, "name": warehouse.name, "code": warehouse.code} for warehouse in warehouses],
    )


@router.get(
    "/sales-entry/pending-customers",
    response_model=list[SalesEntryPendingCustomer],
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def list_sales_entry_pending_customers(
    search: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    clean_search = search.strip() if search else ""
    stmt = (
        select(
            SalesOrder.id.label("sales_order_id"),
            SalesOrder.customer_id.label("customer_id"),
            SalesOrder.warehouse_id.label("warehouse_id"),
            SalesOrder.invoice_number.label("invoice_number"),
            SalesOrder.source.label("source"),
            Employee.full_name.label("salesman_name"),
            SalesOrder.status.label("status"),
            SalesOrder.created_at.label("created_at"),
            Customer.name.label("customer_name"),
        )
        .select_from(SalesOrder)
        .join(Customer, Customer.id == SalesOrder.customer_id)
        .outerjoin(Employee, Employee.id == SalesOrder.salesman_id)
        .where(
            SalesOrder.deleted_at.is_(None),
            SalesOrder.status == "pending",
        )
    )
    if clean_search:
        q = f"%{clean_search}%"
        stmt = stmt.where(
            or_(
                Customer.name.ilike(q),
                SalesOrder.invoice_number.ilike(q),
            )
        )
    rows = (
        await db.execute(
            stmt.order_by(SalesOrder.created_at.asc()).limit(limit)
        )
    ).mappings().all()
    return [
        {
            "sales_order_id": row["sales_order_id"],
            "customer_id": row["customer_id"],
            "customer_name": row["customer_name"],
            "warehouse_id": row["warehouse_id"],
            "invoice_number": row["invoice_number"],
            "source": row["source"].value if hasattr(row["source"], "value") else str(row["source"]),
            "source_label": row["salesman_name"] or (row["source"].value if hasattr(row["source"], "value") else str(row["source"])),
            "status": row["status"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else "",
        }
        for row in rows
    ]


@router.get(
    "/sales-entry/customers/{customer_id}/summary",
    response_model=SalesEntryCustomerSummary,
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def get_sales_entry_customer_summary(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

async def _build_customer_summary(db: AsyncSession, customer: Customer) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    year_start = datetime(now.year, 1, 1, tzinfo=timezone.utc).date()
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc).date()

    annual_sales_amount = Decimal(
        (
            await db.execute(
                select(func.coalesce(func.sum(SalesFinalInvoice.total_amount), Decimal("0")))
                .select_from(SalesFinalInvoice)
                .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
                .where(
                    SalesOrder.customer_id == customer.id,
                    SalesFinalInvoice.deleted_at.is_(None),
                    SalesFinalInvoice.invoice_date >= year_start,
                )
            )
        ).scalar_one()
        or Decimal("0")
    )
    monthly_sales_amount = Decimal(
        (
            await db.execute(
                select(func.coalesce(func.sum(SalesFinalInvoice.total_amount), Decimal("0")))
                .select_from(SalesFinalInvoice)
                .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
                .where(
                    SalesOrder.customer_id == customer.id,
                    SalesFinalInvoice.deleted_at.is_(None),
                    SalesFinalInvoice.invoice_date >= month_start,
                )
            )
        ).scalar_one()
        or Decimal("0")
    )
    last_sale_date = (
        await db.execute(
            select(func.max(SalesFinalInvoice.invoice_date))
            .select_from(SalesFinalInvoice)
            .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
            .where(
                SalesOrder.customer_id == customer.id,
                SalesFinalInvoice.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    last_receipt_date = (
        await db.execute(select(func.max(Payment.payment_date)).where(Payment.customer_id == customer.id))
    ).scalar_one()

    recent_invoice_rows = (
        await db.execute(
            select(
                SalesFinalInvoice.invoice_number,
                SalesFinalInvoice.invoice_date,
                SalesFinalInvoice.total_amount,
            )
            .select_from(SalesFinalInvoice)
            .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
            .where(
                SalesOrder.customer_id == customer.id,
                SalesFinalInvoice.deleted_at.is_(None),
            )
            .order_by(SalesFinalInvoice.invoice_date.desc(), SalesFinalInvoice.created_at.desc())
            .limit(6)
        )
    ).all()
    recent_receipt_rows = (
        await db.execute(
            select(Payment.payment_date, Payment.amount, Payment.mode)
            .where(Payment.customer_id == customer.id)
            .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
            .limit(6)
        )
    ).all()

    # Calculate open challans
    open_challans_rows = (
        await db.execute(
            select(
                SalesOrder.id,
                SalesOrder.invoice_number,
                SalesOrder.created_at,
                func.count(SalesOrderItem.id).label("item_count"),
            )
            .select_from(SalesOrder)
            .outerjoin(SalesOrderItem, SalesOrderItem.sales_order_id == SalesOrder.id)
            .where(
                SalesOrder.customer_id == customer.id,
                SalesOrder.status == "pending",
                SalesOrder.deleted_at.is_(None),
            )
            .group_by(SalesOrder.id)
            .order_by(SalesOrder.created_at.asc())
        )
    ).all()

    address_lines = [
        value
        for value in [
            customer.outlet_name,
            customer.street_address_1,
            customer.street_address_2,
            ", ".join(part for part in [customer.city, customer.state, customer.pincode] if part),
        ]
        if value
    ]
    balance = Decimal(customer.current_balance or Decimal("0"))
    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "address_lines": address_lines,
        "gstin": customer.gstin or customer.gst_number,
        "phone": customer.phone,
        "route_name": customer.route_name,
        "annual_sales_amount": annual_sales_amount,
        "monthly_sales_amount": monthly_sales_amount,
        "balance": abs(balance),
        "balance_side": "DR" if balance >= 0 else "CR",
        "last_sale_date": last_sale_date,
        "last_receipt_date": last_receipt_date,
        "recent_invoices": [
            SalesEntryRecentInvoice(
                invoice_number=invoice_number,
                invoice_date=invoice_date,
                total_amount=total_amount,
            )
            for invoice_number, invoice_date, total_amount in recent_invoice_rows
        ],
        "recent_receipts": [
            SalesEntryRecentReceipt(
                payment_date=payment_date,
                amount=amount,
                mode=mode,
            )
            for payment_date, amount, mode in recent_receipt_rows
        ],
        "open_challans": [
            {
                "challan_id": str(row.id),
                "reference_no": str(row.invoice_number),
                "challan_date": str(row.created_at.date()) if row.created_at else None,
                "item_count": int(row.item_count),
            }
            for row in open_challans_rows
        ],
    }


@router.get(
    "/sales-entry/customers/search",
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def search_sales_entry_customers(
    q: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    stmt = select(Customer)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Customer.name.ilike(term),
                Customer.firm_name.ilike(term),
                Customer.city.ilike(term),
                Customer.gst_number.ilike(term),
            )
        )
    stmt = stmt.order_by(Customer.name.asc()).limit(limit)
    customers = (await db.execute(stmt)).scalars().all()
    
    summaries = []
    for customer in customers:
        summary = await _build_customer_summary(db, customer)
        summaries.append(jsonable_encoder(summary))
    return {"items": summaries}


@router.get(
    "/sales-entry/customers/{customer_id}/summary",
    response_model=SalesEntryCustomerSummary,
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def get_sales_entry_customer_summary(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return await _build_customer_summary(db, customer)


@router.get("/sales-final-invoices", dependencies=[Depends(require_permission("sales", "read"))])
async def list_sales_final_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    clean_search = search.strip() if search else ""
    stmt = (
        select(
            SalesFinalInvoice.id.label("id"),
            SalesFinalInvoice.invoice_number.label("invoice_number"),
            SalesFinalInvoice.invoice_date.label("invoice_date"),
            SalesFinalInvoice.total_amount.label("total_amount"),
            SalesFinalInvoice.status.label("status"),
            SalesFinalInvoice.delivery_status.label("delivery_status"),
            SalesFinalInvoice.created_at.label("created_at"),
            SalesOrder.id.label("sales_order_id"),
            Customer.name.label("customer_name"),
        )
        .select_from(SalesFinalInvoice)
        .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
        .join(Customer, Customer.id == SalesOrder.customer_id)
        .where(SalesFinalInvoice.deleted_at.is_(None))
    )
    if clean_search:
        q = f"%{clean_search}%"
        stmt = stmt.where(
            or_(
                SalesFinalInvoice.invoice_number.ilike(q),
                Customer.name.ilike(q),
            )
        )
    stmt = stmt.order_by(SalesFinalInvoice.created_at.desc())

    total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(total_stmt)).scalar_one()
    rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).mappings().all()

    invoice_ids = [row["id"] for row in rows]
    item_count_map: dict[uuid.UUID, int] = {}
    if invoice_ids:
        counts_stmt = (
            select(SalesFinalInvoiceItem.sales_final_invoice_id, func.count(SalesFinalInvoiceItem.id))
            .where(SalesFinalInvoiceItem.sales_final_invoice_id.in_(invoice_ids))
            .group_by(SalesFinalInvoiceItem.sales_final_invoice_id)
        )
        item_count_rows = (await db.execute(counts_stmt)).all()
        item_count_map = {invoice_id: int(count) for invoice_id, count in item_count_rows}

    items = []
    for row in rows:
        item = dict(row)
        item["item_count"] = item_count_map.get(row["id"], 0)
        items.append(item)

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/sales-final-invoices/{sales_final_invoice_id}", dependencies=[Depends(require_permission("sales", "read"))])
async def get_sales_final_invoice(
    sales_final_invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    invoice = await db.get(SalesFinalInvoice, sales_final_invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales final invoice not found")

    order = await db.get(SalesOrder, invoice.sales_order_id)

    stmt = (
        select(
            SalesFinalInvoiceItem.id.label("id"),
            SalesFinalInvoiceItem.product_id.label("product_id"),
            Product.sku.label("sku"),
            Product.name.label("product_name"),
            Product.unit.label("unit"),
            SalesFinalInvoiceItem.quantity.label("quantity"),
            SalesFinalInvoiceItem.selling_price.label("selling_price"),
            SalesFinalInvoiceItem.total_amount.label("total_amount"),
            SalesFinalInvoiceItem.discount_percent.label("discount_percent"),
            SalesFinalInvoiceItem.gst_percent.label("gst_percent"),
        )
        .select_from(SalesFinalInvoiceItem)
        .join(Product, Product.id == SalesFinalInvoiceItem.product_id)
        .where(SalesFinalInvoiceItem.sales_final_invoice_id == sales_final_invoice_id)
        .order_by(Product.name.asc())
    )
    rows = (await db.execute(stmt)).mappings().all()
    
    response = jsonable_encoder(invoice)
    response["customer_id"] = str(order.customer_id) if order else None
    response["warehouse_id"] = str(order.warehouse_id) if order else None
    response["items"] = jsonable_encoder([dict(row) for row in rows])
    return response


@router.get("/dashboard/pending-orders", response_model=PendingOrdersDashboardResponse, dependencies=[Depends(require_permission("sales", "read"))])
async def dashboard_pending_orders(
    warehouse_id: uuid.UUID | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    stmt = (
        select(SalesOrder, Customer, PackingTask.id.label("packing_task_id"))
        .join(Customer, Customer.id == SalesOrder.customer_id)
        .outerjoin(PackingTask, PackingTask.sales_order_id == SalesOrder.id)
        .where(
            SalesOrder.deleted_at.is_(None),
            func.upper(SalesOrder.status) == "PENDING",
            PackingTask.id.is_(None),
        )
        .order_by(SalesOrder.created_at.asc())
        .limit(limit)
    )
    if warehouse_id is not None:
        stmt = stmt.where(SalesOrder.warehouse_id == warehouse_id)

    rows = (await db.execute(stmt)).all()
    return {
        "count": len(rows),
        "items": [
            {
                "sales_order_id": str(order.id),
                "customer_id": str(order.customer_id),
                "customer_name": customer.name,
                "warehouse_id": str(order.warehouse_id),
                "source": order.source.value if hasattr(order.source, "value") else str(order.source),
                "status": order.status,
                "created_at": order.created_at.isoformat(),
            }
            for order, customer, _initial_invoice_id in rows
        ],
    }


async def _prepare_sales_order(
    payload: SalesOrderPrepareCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db, idempotency_key, "sales:prepare_sales_order", payload.model_dump(mode="json")
    )
    if replay_body is not None:
        return replay_body

    order = await db.get(SalesOrder, payload.sales_order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales order not found")
    if payload.invoice_number and payload.invoice_number.strip():
        order.invoice_number = payload.invoice_number.strip()
    # Packing workflow is intentionally deferred to the next phase.
    # Do not create/update packing_tasks in the current step.
    order.status = VoucherStatus.CREATED.value

    try:
        await post_customer_sales_invoice_receivable(db, final_invoice)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(order)
    response = {
        "sales_order_id": str(order.id),
        "invoice_number": order.invoice_number,
        "status": order.status,
        "packing_task_id": None,
    }
    await idempotency_store_response(
        db, idempotency_key, "sales:prepare_sales_order", req_hash, replay_code or 201, response
    )
    return response


@router.post("/sales-orders/prepare", dependencies=[Depends(require_permission("sales", "create"))])
async def prepare_sales_order(
    payload: SalesOrderPrepareCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
    auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    return await _prepare_sales_order(payload, db, idempotency_key, auth)


# Deprecated route kept temporarily for backward compatibility.
@router.post("/sales-initial-invoices", dependencies=[Depends(require_permission("sales", "create"))])
async def create_initial_invoice_legacy(
    payload: SalesOrderPrepareCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
    auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    return await _prepare_sales_order(payload, db, idempotency_key, auth)


@router.post("/sales-final-invoices", dependencies=[Depends(require_permission("sales", "create"))])
async def create_final_invoice(
    payload: SalesFinalInvoiceCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db, idempotency_key, "sales:create_final_invoice", payload.model_dump(mode="json")
    )
    if replay_body is not None:
        return replay_body

    order = await db.get(SalesOrder, payload.sales_order_id)
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales order not found")

    due_dt = payload.due_date if payload.due_date is not None else payload.invoice_date
    if due_dt < payload.invoice_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date cannot be before invoice date")
    final_invoice = SalesFinalInvoice(
        sales_order_id=payload.sales_order_id,
        invoice_number=payload.invoice_number,
        invoice_date=payload.invoice_date,
        due_date=due_dt,
        subtotal=payload.subtotal,
        gst_amount=payload.gst_amount,
        total_amount=payload.total_amount,
        status=(payload.status or VoucherStatus.POSTED.value).upper(),
    )
    db.add(final_invoice)
    await db.flush()

    reserve_items_res = await db.execute(
        select(SalesOrderReservation).where(SalesOrderReservation.sales_order_id == payload.sales_order_id)
    )
    reserve_items = reserve_items_res.scalars().all()

    for reserve in reserve_items:
        db.add(
            SalesFinalInvoiceItem(
                sales_final_invoice_id=final_invoice.id,
                product_id=reserve.product_id,
                batch_number=reserve.batch_number,
                quantity=reserve.reserved_quantity or Decimal("0"),
                selling_price=None,
                gst_percent=None,
                discount_percent=None,
                total_amount=None,
            )
        )

    try:
        await consume_reserved_stock_for_final_invoice(db, final_invoice)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        await post_customer_sales_invoice_receivable(db, final_invoice)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(final_invoice)

    response = jsonable_encoder(final_invoice)
    await idempotency_store_response(
        db, idempotency_key, "sales:create_final_invoice", req_hash, replay_code or 201, response
    )
    return response


@router.post("/sales-final-invoices/from-sales-order", dependencies=[Depends(require_permission("sales", "create"))])
async def create_final_invoice_from_sales_order(
    payload: SalesFinalInvoiceFromOrderCreate,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    order = await db.get(SalesOrder, payload.sales_order_id)
    if order is None or order.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales order not found")

    requested_items = [item for item in payload.items if Decimal(item.quantity) > 0]
    if not requested_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one invoice item is required")

    order_items_res = await db.execute(
        select(SalesOrderItem)
        .where(SalesOrderItem.sales_order_id == order.id)
    )
    order_items = {item.id: item for item in order_items_res.scalars().all()}

    if not order_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sales order has no pending items")

    subtotal = Decimal("0")
    gst_amount = Decimal("0")
    total_amount = Decimal("0")
    product_reservations: dict[uuid.UUID, Decimal] = {}
    invoice_item_payloads: list[dict[str, object]] = []
    delivered_by_order_item: dict[uuid.UUID, Decimal] = {}

    for requested in requested_items:
        order_item = order_items.get(requested.sales_order_item_id)
        if order_item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales order item not found")

        deliver_qty = Decimal(requested.quantity)
        current_qty = Decimal(order_item.quantity)
        if deliver_qty <= 0:
            continue
        if deliver_qty > current_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Deliver quantity cannot exceed ordered quantity for item {order_item.id}",
            )

        unit_price = Decimal(order_item.selling_price or order_item.unit_price or 0)
        discount_percent = Decimal(order_item.discount_percent or 0)
        gst_percent = Decimal(order_item.gst_percent or 0)
        line_subtotal = unit_price * deliver_qty
        line_discount = (line_subtotal * discount_percent / Decimal("100")) if discount_percent else Decimal("0")
        line_total = line_subtotal - line_discount
        taxable_amount, line_gst = _split_inclusive_tax(line_total, gst_percent)

        subtotal += taxable_amount
        gst_amount += line_gst
        total_amount += line_total
        product_reservations[order_item.product_id] = product_reservations.get(order_item.product_id, Decimal("0")) + deliver_qty
        delivered_by_order_item[order_item.id] = deliver_qty
        invoice_item_payloads.append(
            {
                "product_id": order_item.product_id,
                "batch_number": order_item.batch_number,
                "quantity": deliver_qty,
                "selling_price": unit_price,
                "gst_percent": order_item.gst_percent,
                "discount_percent": order_item.discount_percent,
                "total_amount": line_total,
            }
        )

    if not invoice_item_payloads:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one invoice item is required")

    invoice_number = payload.invoice_number.strip() if payload.invoice_number and payload.invoice_number.strip() else None
    if invoice_number is None:
        invoice_number = f"SFI-{datetime.now(IST).strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:6].upper()}"

    due_dt = payload.due_date if payload.due_date is not None else payload.invoice_date
    final_invoice = SalesFinalInvoice(
        sales_order_id=order.id,
        invoice_number=invoice_number,
        invoice_date=payload.invoice_date,
        due_date=due_dt,
        subtotal=subtotal,
        gst_amount=gst_amount,
        total_amount=total_amount,
        status=(payload.status or VoucherStatus.POSTED.value).upper(),
    )
    db.add(final_invoice)
    await db.flush()

    for item_payload in invoice_item_payloads:
        db.add(SalesFinalInvoiceItem(sales_final_invoice_id=final_invoice.id, **item_payload))

    try:
        await consume_reserved_stock_for_final_invoice_quantities(
            db,
            final_invoice,
            list(product_reservations.items()),
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    for order_item_id, delivered_qty in delivered_by_order_item.items():
        order_item = order_items[order_item_id]
        remaining_qty = Decimal(order_item.quantity) - delivered_qty
        if remaining_qty <= 0:
            await db.delete(order_item)
        else:
            order_item.quantity = remaining_qty

    remaining_items_count = (
        await db.execute(
            select(func.count())
            .select_from(SalesOrderItem)
            .where(SalesOrderItem.sales_order_id == order.id)
        )
    ).scalar_one()
    order.status = "pending" if remaining_items_count > 0 else "completed"

    await db.commit()
    await db.refresh(final_invoice)
    return jsonable_encoder(final_invoice)


@router.post("/sales-final-invoices/direct", dependencies=[Depends(require_permission("sales", "create"))])
async def create_direct_final_invoice(
    payload: SalesDirectBillCreate,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    customer = await db.get(Customer, payload.customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    raise_if_duplicate_line_products(payload.items)

    due_dt = payload.due_date if payload.due_date is not None else payload.invoice_date
    if due_dt < payload.invoice_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date cannot be before invoice date")

    invoice_number = payload.invoice_number.strip() if payload.invoice_number and payload.invoice_number.strip() else None
    if invoice_number is None:
        invoice_number = f"SO-{datetime.now(IST).strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:6].upper()}"

    order = SalesOrder(
        warehouse_id=payload.warehouse_id,
        customer_id=payload.customer_id,
        salesman_id=None,
        invoice_number=invoice_number,
        challan_date=payload.invoice_date,
        source=OrderSource.ADMIN,
        status="pending",
    )
    db.add(order)
    await db.flush()

    for item in payload.items:
        product = await db.get(Product, item.product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        unit_price, _source = await resolve_price_for_customer(db, customer, product)
        db.add(
            SalesOrderItem(
                sales_order_id=order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=unit_price,
                selling_price=unit_price,
                gst_percent=product.tax_percent,
            )
        )

    await db.flush()
    try:
        await apply_schemes_to_sales_order(db, order, customer)
        await db.flush()
        await release_reserved_stock_for_sales_order(db, order)
        await reserve_stock_fefo_for_sales_order(
            db,
            order,
            allow_negative_override=True,
            override_reason="AUTO_NEGATIVE_OVERRIDE",
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    order_items_res = await db.execute(
        select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order.id)
    )
    order_items = order_items_res.scalars().all()
    if not order_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sales order has no pending items")

    invoice_payload = SalesFinalInvoiceFromOrderCreate(
        sales_order_id=order.id,
        invoice_number=payload.invoice_number,
        invoice_date=payload.invoice_date,
        due_date=payload.due_date,
        items=[
            SalesFinalInvoiceItemIn(sales_order_item_id=item.id, quantity=item.quantity)
            for item in order_items
        ],
    )
    response = await create_final_invoice_from_sales_order(invoice_payload, db, _auth)
    return response


@router.post("/sales-final-invoices/{sales_final_invoice_id}/edit", dependencies=[Depends(require_permission("sales", "update"))])
async def edit_final_invoice(
    sales_final_invoice_id: uuid.UUID,
    payload: SalesFinalInvoiceEditRequest,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db,
        idempotency_key,
        "sales:edit_final_invoice",
        {"sales_final_invoice_id": str(sales_final_invoice_id), **payload.model_dump(mode="json")},
    )
    if replay_body is not None:
        return replay_body

    invoice = await db.get(SalesFinalInvoice, sales_final_invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales final invoice not found")

    items_res = await db.execute(
        select(SalesFinalInvoiceItem).where(SalesFinalInvoiceItem.sales_final_invoice_id == sales_final_invoice_id)
    )
    items = items_res.scalars().all()

    snapshot = {
        "invoice": jsonable_encoder(invoice),
        "items": [jsonable_encoder(i) for i in items],
    }
    next_version = int(invoice.version) + 1

    old_total = Decimal(invoice.total_amount)

    if payload.subtotal is not None:
        invoice.subtotal = payload.subtotal
    if payload.gst_amount is not None:
        invoice.gst_amount = payload.gst_amount
    if payload.total_amount is not None:
        invoice.total_amount = payload.total_amount
    if payload.status is not None:
        try:
            invoice.status = assert_voucher_transition(invoice.status, payload.status, "sales_final_invoice")
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if payload.delivery_status is not None:
        invoice.delivery_status = payload.delivery_status
        if payload.delivery_status.upper() == "DELIVERED":
            invoice.delivered_at = datetime.now(timezone.utc)
    if payload.due_date is not None:
        if payload.due_date < invoice.invoice_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date cannot be before invoice date")
        invoice.due_date = payload.due_date

    invoice.version = next_version

    db.add(
        InvoiceVersion(
            sales_final_invoice_id=invoice.id,
            version_number=next_version,
            changed_by=None,
            change_reason=payload.reason,
            snapshot_json=json.dumps(snapshot, default=str),
            created_at=datetime.now(timezone.utc),
        )
    )

    notes: list[dict[str, str]] = []
    if payload.auto_note and payload.total_amount is not None:
        delta = Decimal(invoice.total_amount) - old_total
        if delta != 0:
            order = await db.get(SalesOrder, invoice.sales_order_id)
            customer = await db.get(Customer, order.customer_id)
            if delta > 0:
                note = DebitNote(
                    reference_invoice_id=invoice.id,
                    amount=delta,
                    reason=payload.reason or "Invoice amount increased after edit",
                )
                db.add(note)
                await db.flush()
                await post_party_ledger_entry(
                    db,
                    party_type=PartyType.CUSTOMER,
                    party_id=customer.id,
                    party_name=customer.name,
                    entry_kind=PartyLedgerEntryKind.DEBIT_NOTE,
                    entry_date=datetime.now(timezone.utc).date(),
                    description=f"Debit Note for Invoice {invoice.invoice_number}",
                    reference_type="debit_note",
                    reference_id=note.id,
                    admin_debit=delta,
                    admin_credit=Decimal("0"),
                )
                notes.append({"type": "DEBIT_NOTE", "id": str(note.id)})
            elif delta < 0:
                note = CreditNote(
                    reference_invoice_id=invoice.id,
                    amount=abs(delta),
                    reason=payload.reason or "Invoice amount reduced after edit",
                )
                db.add(note)
                await db.flush()
                await post_party_ledger_entry(
                    db,
                    party_type=PartyType.CUSTOMER,
                    party_id=customer.id,
                    party_name=customer.name,
                    entry_kind=PartyLedgerEntryKind.CREDIT_NOTE,
                    entry_date=datetime.now(timezone.utc).date(),
                    description=f"Credit Note for Invoice {invoice.invoice_number}",
                    reference_type="credit_note",
                    reference_id=note.id,
                    admin_debit=Decimal("0"),
                    admin_credit=abs(delta),
                )
                notes.append({"type": "CREDIT_NOTE", "id": str(note.id)})

    db.add(
        AuditLog(
            actor_user_id=None,
            action="SALES_FINAL_INVOICE_EDIT",
            entity_name="sales_final_invoices",
            entity_id=invoice.id,
            old_values=json.dumps(snapshot, default=str),
            new_values=json.dumps(payload.model_dump(mode="json"), default=str),
            trace_id=None,
            occurred_at=datetime.now(timezone.utc),
        )
    )

    await db.commit()
    await db.refresh(invoice)

    response = {
        "sales_final_invoice_id": str(invoice.id),
        "version": invoice.version,
        "status": invoice.status,
        "delivery_status": invoice.delivery_status,
        "total_amount": str(invoice.total_amount),
        "notes": notes,
    }
    await idempotency_store_response(
        db, idempotency_key, "sales:edit_final_invoice", req_hash, replay_code or 200, response
    )
    return response


@router.post("/sales-returns", dependencies=[Depends(require_permission("sales", "create"))])
async def create_sales_return(
    payload: SalesReturnCreate,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    invoice = await db.get(SalesFinalInvoice, payload.sales_final_invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales final invoice not found")
    row = SalesReturn(
        sales_final_invoice_id=payload.sales_final_invoice_id,
        return_date=payload.return_date,
        reason=payload.reason,
        status=VoucherStatus.CREATED.value,
    )
    db.add(row)
    await db.flush()
    for item in payload.items:
        db.add(SalesReturnItem(sales_return_id=row.id, **item.model_dump()))
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/sales-returns", dependencies=[Depends(require_permission("sales", "read"))])
async def list_sales_returns(
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    return (await db.execute(select(SalesReturn).where(SalesReturn.deleted_at.is_(None)))).scalars().all()


@router.post("/sales-expiries", dependencies=[Depends(require_permission("sales", "create"))])
async def create_sales_expiry(
    payload: SalesExpiryCreate,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    row = SalesExpiry(
        customer_id=payload.customer_id,
        expiry_date=payload.expiry_date,
        reason=payload.reason,
        status=VoucherStatus.CREATED.value,
    )
    db.add(row)
    await db.flush()
    for item in payload.items:
        db.add(SalesExpiryItem(sales_expiry_id=row.id, **item.model_dump()))
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/sales-expiries", dependencies=[Depends(require_permission("sales", "read"))])
async def list_sales_expiries(
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    return (await db.execute(select(SalesExpiry).where(SalesExpiry.deleted_at.is_(None)))).scalars().all()


@router.post("/sales-entry/customer-receipts", dependencies=[Depends(require_permission("sales", "create"))])
async def create_sales_entry_customer_receipt(
    payload: PartyLedgerPaymentCreate,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    """Record incoming customer receipt with optional sales-invoice allocations (same ledger as Accounting module)."""
    try:
        resolved_party_type = PartyType(payload.party_type.upper())
        if resolved_party_type != PartyType.CUSTOMER:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="party_type must be CUSTOMER")
        resolved_direction = PaymentFlowDirection(payload.direction.upper())
        if resolved_direction != PaymentFlowDirection.INCOMING:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="direction must be INCOMING for customer receipts")
        payment = await record_party_payment(
            db,
            party_type=resolved_party_type,
            party_id=payload.party_id,
            amount=payload.amount,
            direction=resolved_direction,
            self_account_id=payload.self_account_id,
            payment_mode=payload.payment_mode,
            payment_date_value=payload.payment_date,
            reference_no=payload.reference_no,
            note=payload.note,
            purchase_bill_allocations=[],
            sales_invoice_allocations=[
                {"sales_final_invoice_id": row.sales_final_invoice_id, "allocated_amount": row.allocated_amount}
                for row in payload.sales_invoice_allocations
            ],
        )
        return jsonable_encoder(payment)
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get(
    "/sales-entry/customers/{customer_id}/sales-invoices-for-receipt",
    response_model=list[SalesInvoiceForReceiptAllocation],
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def list_sales_entry_customer_invoices_for_receipt(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    rows = await list_customer_sales_invoices_for_receipt_allocation(db, customer_id=customer_id)
    return [SalesInvoiceForReceiptAllocation(**r) for r in rows]


@router.get(
    "/sales-entry/customers/{customer_id}/payments-for-invoice-allocation",
    response_model=list[CustomerIncomingPaymentForAllocation],
    dependencies=[Depends(require_permission("sales", "read"))],
)
async def list_sales_entry_customer_payments_for_invoice_allocation(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    rows = await list_customer_incoming_party_payments_for_invoice_allocation(db, customer_id=customer_id)
    return [CustomerIncomingPaymentForAllocation(**r) for r in rows]


@router.post(
    "/sales-entry/customers/{customer_id}/payments/{payment_id}/sales-invoice-allocations",
    dependencies=[Depends(require_permission("sales", "create"))],
)
async def append_sales_entry_customer_payment_invoice_allocations(
    customer_id: uuid.UUID,
    payment_id: uuid.UUID,
    payload: SalesInvoiceAllocationsAppend,
    db: AsyncSession = Depends(get_db),
    _auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    try:
        await add_sales_invoice_allocations_to_existing_party_payment(
            db,
            payment_id=payment_id,
            customer_id=customer_id,
            sales_invoice_allocations=[
                {"sales_final_invoice_id": row.sales_final_invoice_id, "allocated_amount": row.allocated_amount}
                for row in payload.allocations
            ],
        )
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    return {"ok": True}
