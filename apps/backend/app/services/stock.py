import uuid
from datetime import datetime, timezone
from decimal import Decimal
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    AuditLog,
    InventoryBatch,
    PurchaseBill,
    PurchaseBillItem,
    PurchaseChallan,
    SalesFinalInvoice,
    SalesOrder,
    SalesOrderReservation,
    SalesOrderItem,
    StockMovement,
    StockMoveType,
    VoucherStatus,
)
from app.services.workflow import assert_voucher_transition, normalize_status


class InsufficientStockError(ValueError):
    pass


async def post_purchase_bill(session: AsyncSession, purchase_bill_id):
    bill = await session.get(PurchaseBill, purchase_bill_id)
    if bill is None:
        raise ValueError("Purchase bill not found")
    if bill.posted:
        return bill

    challan = await session.get(PurchaseChallan, bill.purchase_challan_id)
    if challan is None:
        raise ValueError("Purchase challan not found")

    bill.status = normalize_status(bill.status)
    challan.status = normalize_status(challan.status)
    bill.status = assert_voucher_transition(bill.status, VoucherStatus.POSTED.value, "purchase_bill")
    challan.status = assert_voucher_transition(challan.status, VoucherStatus.POSTED.value, "purchase_challan")

    items_res = await session.execute(select(PurchaseBillItem).where(PurchaseBillItem.purchase_bill_id == bill.id))
    items = items_res.scalars().all()

    for item in items:
        batch_res = await session.execute(
            select(InventoryBatch).where(
                InventoryBatch.warehouse_id == challan.warehouse_id,
                InventoryBatch.product_id == item.product_id,
                InventoryBatch.batch_no == item.batch_no,
            )
        )
        batch = batch_res.scalar_one_or_none()
        if batch is None:
            batch = InventoryBatch(
                warehouse_id=challan.warehouse_id,
                product_id=item.product_id,
                batch_no=item.batch_no,
                expiry_date=item.expiry_date,
                available_quantity=Decimal("0"),
                reserved_quantity=Decimal("0"),
                damaged_quantity=Decimal("0"),
            )
            session.add(batch)

        batch.available_quantity = Decimal(batch.available_quantity) + Decimal(item.quantity)

        movement = StockMovement(
            warehouse_id=challan.warehouse_id,
            product_id=item.product_id,
            batch_no=item.batch_no,
            move_type=StockMoveType.IN,
            quantity=item.quantity,
            reference_type="purchase_bill",
            reference_id=bill.id,
            created_at=datetime.now(timezone.utc),
        )
        session.add(movement)

    bill.posted = True
    await session.commit()
    return bill


async def reserve_stock_fefo_for_sales_order(
    session: AsyncSession,
    sales_order: SalesOrder,
    *,
    allow_negative_override: bool = False,
    override_reason: str | None = None,
):
    items_res = await session.execute(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == sales_order.id))
    order_items = items_res.scalars().all()
    item_quantities = [(item.product_id, Decimal(item.quantity)) for item in order_items]
    await reserve_stock_fefo_for_sales_order_quantities(
        session,
        sales_order,
        item_quantities,
        allow_negative_override=allow_negative_override,
        override_reason=override_reason,
    )


async def reserve_stock_fefo_for_sales_order_quantities(
    session: AsyncSession,
    sales_order: SalesOrder,
    item_quantities: list[tuple[uuid.UUID, Decimal]],
    *,
    allow_negative_override: bool = False,
    override_reason: str | None = None,
):
    if allow_negative_override and not (override_reason and override_reason.strip()):
        raise ValueError("override_reason is required when allow_negative_override is true")

    for product_id, requested_quantity in item_quantities:
        required = Decimal(requested_quantity)

        batch_res = await session.execute(
            select(InventoryBatch)
            .where(
                InventoryBatch.warehouse_id == sales_order.warehouse_id,
                InventoryBatch.product_id == product_id,
                InventoryBatch.available_quantity > 0,
            )
            .order_by(InventoryBatch.expiry_date.asc().nulls_last(), InventoryBatch.created_at.asc())
        )
        batches = batch_res.scalars().all()

        for batch in batches:
            if required <= 0:
                break
            available = Decimal(batch.available_quantity)
            if available <= 0:
                continue

            allocate = min(available, required)
            batch.available_quantity = available - allocate
            batch.reserved_quantity = Decimal(batch.reserved_quantity) + allocate

            session.add(
                SalesOrderReservation(
                    id=uuid.uuid1(),
                    sales_order_id=sales_order.id,
                    product_id=product_id,
                    batch_number=batch.batch_no,
                    reserved_quantity=allocate,
                    picked_quantity=Decimal("0"),
                )
            )
            session.add(
                StockMovement(
                    warehouse_id=sales_order.warehouse_id,
                    product_id=product_id,
                    batch_no=batch.batch_no,
                    move_type=StockMoveType.RESERVE,
                    quantity=allocate,
                    reference_type="sales_order",
                    reference_id=sales_order.id,
                    created_at=datetime.now(timezone.utc),
                )
            )
            required -= allocate

        if required > 0:
            if not allow_negative_override:
                raise InsufficientStockError(
                    f"Insufficient stock for product {product_id}. Missing qty: {required}"
                )

            session.add(
                SalesOrderReservation(
                    id=uuid.uuid1(),
                    sales_order_id=sales_order.id,
                    product_id=product_id,
                    batch_number="NEGATIVE_OVERRIDE",
                    reserved_quantity=required,
                    picked_quantity=Decimal("0"),
                )
            )
            session.add(
                StockMovement(
                    warehouse_id=sales_order.warehouse_id,
                    product_id=product_id,
                    batch_no="NEGATIVE_OVERRIDE",
                    move_type=StockMoveType.RESERVE,
                    quantity=required,
                    reference_type="sales_order",
                    reference_id=sales_order.id,
                    created_at=datetime.now(timezone.utc),
                )
            )
            session.add(
                AuditLog(
                    actor_user_id=None,
                    action="NEGATIVE_STOCK_OVERRIDE",
                    entity_name="sales_orders",
                    entity_id=sales_order.id,
                    old_values=None,
                    new_values=json.dumps(
                        {
                            "product_id": str(product_id),
                            "missing_quantity": str(required),
                            "reason": override_reason,
                        }
                    ),
                    trace_id=None,
                    occurred_at=datetime.now(timezone.utc),
                )
            )


async def consume_reserved_stock_for_final_invoice(session: AsyncSession, sales_final_invoice: SalesFinalInvoice):
    sales_order = await session.get(SalesOrder, sales_final_invoice.sales_order_id)
    if sales_order is None:
        raise ValueError("Sales order not found")

    reserve_items_res = await session.execute(
        select(SalesOrderReservation).where(SalesOrderReservation.sales_order_id == sales_order.id)
    )
    reserve_items = reserve_items_res.scalars().all()

    for reserve in reserve_items:
        qty = Decimal(reserve.reserved_quantity or 0)
        if qty <= 0:
            continue

        if reserve.batch_number != "NEGATIVE_OVERRIDE":
            batch_res = await session.execute(
                select(InventoryBatch).where(
                    InventoryBatch.warehouse_id == sales_order.warehouse_id,
                    InventoryBatch.product_id == reserve.product_id,
                    InventoryBatch.batch_no == reserve.batch_number,
                )
            )
            batch = batch_res.scalar_one_or_none()
            if batch is None:
                raise ValueError("Reserved batch not found during final invoice posting")

            reserved_qty = Decimal(batch.reserved_quantity)
            if reserved_qty < qty:
                raise ValueError("Reserved quantity mismatch during final invoice posting")

            batch.reserved_quantity = reserved_qty - qty

        reserve.picked_quantity = qty

        session.add(
            StockMovement(
                warehouse_id=sales_order.warehouse_id,
                product_id=reserve.product_id,
                batch_no=reserve.batch_number or "UNKNOWN",
                move_type=StockMoveType.OUT,
                quantity=qty,
                reference_type="sales_final_invoice",
                reference_id=sales_final_invoice.id,
                created_at=datetime.now(timezone.utc),
            )
        )


async def consume_reserved_stock_for_final_invoice_quantities(
    session: AsyncSession,
    sales_final_invoice: SalesFinalInvoice,
    item_quantities: list[tuple[uuid.UUID, Decimal]],
):
    sales_order = await session.get(SalesOrder, sales_final_invoice.sales_order_id)
    if sales_order is None:
        raise ValueError("Sales order not found")

    for product_id, requested_quantity in item_quantities:
        required = Decimal(requested_quantity)
        if required <= 0:
            continue

        reserve_items_res = await session.execute(
            select(SalesOrderReservation)
            .where(
                SalesOrderReservation.sales_order_id == sales_order.id,
                SalesOrderReservation.product_id == product_id,
            )
            .order_by(SalesOrderReservation.id.asc())
        )
        reserve_items = reserve_items_res.scalars().all()

        for reserve in reserve_items:
            if required <= 0:
                break

            reserved_qty = Decimal(reserve.reserved_quantity or 0)
            picked_qty = Decimal(reserve.picked_quantity or 0)
            remaining_reserved = reserved_qty - picked_qty
            if remaining_reserved <= 0:
                continue

            consume_qty = min(remaining_reserved, required)

            if reserve.batch_number != "NEGATIVE_OVERRIDE":
                batch_res = await session.execute(
                    select(InventoryBatch).where(
                        InventoryBatch.warehouse_id == sales_order.warehouse_id,
                        InventoryBatch.product_id == reserve.product_id,
                        InventoryBatch.batch_no == reserve.batch_number,
                    )
                )
                batch = batch_res.scalar_one_or_none()
                if batch is None:
                    raise ValueError("Reserved batch not found during final invoice posting")

                batch_reserved_qty = Decimal(batch.reserved_quantity)
                if batch_reserved_qty < consume_qty:
                    raise ValueError("Reserved quantity mismatch during final invoice posting")

                batch.reserved_quantity = batch_reserved_qty - consume_qty

            reserve.picked_quantity = picked_qty + consume_qty

            session.add(
                StockMovement(
                    warehouse_id=sales_order.warehouse_id,
                    product_id=reserve.product_id,
                    batch_no=reserve.batch_number or "UNKNOWN",
                    move_type=StockMoveType.OUT,
                    quantity=consume_qty,
                    reference_type="sales_final_invoice",
                    reference_id=sales_final_invoice.id,
                    created_at=datetime.now(timezone.utc),
                )
            )
            required -= consume_qty

        if required > 0:
            raise ValueError(f"Insufficient reserved stock for product {product_id}. Missing qty: {required}")
