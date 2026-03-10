import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
import json
import math
from urllib.parse import urlencode

import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import (
    AccountType,
    Customer,
    DeliveryAssignment,
    DeliveryDailyAssignment,
    DeliveryRun,
    DeliveryRunSourceBatch,
    DeliveryRunStop,
    Employee,
    EmployeeRole,
    InvoiceAssignmentBatch,
    InvoiceAssignmentBatchInvoice,
    InvoiceExecutionItem,
    InvoicePackingOutput,
    InvoiceShortfallReturn,
    InvoiceWorkflowStatus,
    NotificationType,
    OrderSource,
    Pricing,
    Product,
    PodEvent,
    SalesFinalInvoice,
    SalesFinalInvoiceItem,
    SalesOrder,
    SalesOrderItem,
    ShortfallReason,
    SupervisorDecision,
    User,
    UserNotification,
    Vehicle,
    Warehouse,
)

ACTIVE_WORKFLOW_STATUSES = {
    InvoiceWorkflowStatus.PACKERS_ASSIGNED.value,
    InvoiceWorkflowStatus.VERIFICATION_PENDING.value,
    InvoiceWorkflowStatus.PACKING_STARTED.value,
    InvoiceWorkflowStatus.READY_TO_DISPATCH.value,
}

ACTIVE_DELIVERY_RUN_STATUSES = {
    InvoiceWorkflowStatus.VEHICLE_ALLOCATED.value,
    "LOADING_IN_PROGRESS",
    "LOADED_WAITING_DOCS",
    "READY_TO_START",
    InvoiceWorkflowStatus.DELIVERY_STARTED.value,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_status(value: str) -> str:
    return str(value or "").strip().upper()


def _normalize_reason(value: str | None) -> str | None:
    if value is None or not str(value).strip():
        return None
    normalized = str(value).strip().upper()
    allowed = {reason.value for reason in ShortfallReason}
    if normalized not in allowed:
        raise ValueError(f"Unsupported shortfall reason '{value}'")
    return normalized


def _case_size(product: Product) -> Decimal | None:
    for value in (product.conv_3_to_1, product.conv_2_to_1, product.conv_3_to_2):
        numeric = Decimal(value or 0)
        if numeric > 0:
            return numeric
    return None


def _batch_code() -> str:
    stamp = _utcnow().strftime("%Y%m%d%H%M%S")
    return f"PKG-{stamp}-{str(uuid.uuid4())[:6].upper()}"


def _coord_str(latitude: Decimal | float | int, longitude: Decimal | float | int) -> str:
    return f"{Decimal(latitude):f},{Decimal(longitude):f}"


def _build_maps_browser_url(
    *,
    warehouse_lat: Decimal,
    warehouse_lng: Decimal,
    ordered_stops: list[dict[str, object]],
) -> str:
    query = {
        "api": "1",
        "origin": _coord_str(warehouse_lat, warehouse_lng),
        "destination": _coord_str(warehouse_lat, warehouse_lng),
        "travelmode": "driving",
    }
    waypoint_values = [
        _coord_str(stop["customer_latitude"], stop["customer_longitude"])
        for stop in ordered_stops
    ]
    if waypoint_values:
        query["waypoints"] = "|".join(waypoint_values)
    return f"https://www.google.com/maps/dir/?{urlencode(query)}"


async def _create_notification(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    notification_type: str,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
) -> UserNotification:
    notification = UserNotification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        is_read=False,
        created_at=_utcnow(),
    )
    session.add(notification)
    await session.flush()
    return notification


async def _reverse_shortfall_returns(session: AsyncSession, batch_invoice_id: uuid.UUID) -> None:
    rows = (
        await session.execute(
            select(InvoiceShortfallReturn).where(InvoiceShortfallReturn.batch_invoice_id == batch_invoice_id)
        )
    ).scalars().all()
    for row in rows:
        order_item = await session.get(SalesOrderItem, row.returned_sales_order_item_id) if row.returned_sales_order_item_id else None
        if order_item is not None:
            next_qty = Decimal(order_item.quantity or 0) - Decimal(row.quantity or 0)
            if next_qty <= 0:
                await session.delete(order_item)
            else:
                order_item.quantity = next_qty
        order = await session.get(SalesOrder, row.returned_sales_order_id)
        if order is not None:
            count_stmt = select(func.count()).select_from(SalesOrderItem).where(SalesOrderItem.sales_order_id == order.id)
            remaining = (await session.execute(count_stmt)).scalar_one()
            order.status = "pending" if remaining > 0 else "completed"
        await session.delete(row)


async def _ensure_pending_sales_order(session: AsyncSession, customer_id: uuid.UUID, warehouse_id: uuid.UUID) -> SalesOrder:
    stmt = (
        select(SalesOrder)
        .where(
            SalesOrder.customer_id == customer_id,
            SalesOrder.warehouse_id == warehouse_id,
            SalesOrder.deleted_at.is_(None),
            func.upper(SalesOrder.status) == "PENDING",
        )
        .order_by(SalesOrder.created_at.asc())
        .limit(1)
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return existing

    order = SalesOrder(
        customer_id=customer_id,
        warehouse_id=warehouse_id,
        challan_date=_utcnow().date(),
        source=OrderSource.ADMIN,
        status="pending",
        invoice_number=f"SO-RET-{_utcnow().strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:6].upper()}",
    )
    session.add(order)
    await session.flush()
    return order


async def _apply_shortfall_returns(session: AsyncSession, batch_invoice_id: uuid.UUID) -> None:
    batch_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if batch_invoice is None:
        raise ValueError("Workflow invoice not found")
    final_invoice = await session.get(SalesFinalInvoice, batch_invoice.sales_final_invoice_id)
    if final_invoice is None:
        raise ValueError("Sales final invoice not found")
    sales_order = await session.get(SalesOrder, final_invoice.sales_order_id)
    if sales_order is None:
        raise ValueError("Sales order not found")

    execution_rows = (
        await session.execute(
            select(InvoiceExecutionItem).where(InvoiceExecutionItem.batch_invoice_id == batch_invoice_id)
        )
    ).scalars().all()

    for execution in execution_rows:
        shortfall = Decimal(execution.shortfall_quantity or 0)
        if shortfall <= 0:
            continue
        pending_order = await _ensure_pending_sales_order(session, sales_order.customer_id, sales_order.warehouse_id)
        item_stmt = (
            select(SalesOrderItem)
            .where(
                SalesOrderItem.sales_order_id == pending_order.id,
                SalesOrderItem.product_id == execution.product_id,
            )
            .order_by(SalesOrderItem.created_at.asc())
            .limit(1)
        )
        order_item = (await session.execute(item_stmt)).scalar_one_or_none()
        invoice_item = await session.get(SalesFinalInvoiceItem, execution.sales_final_invoice_item_id)
        if invoice_item is None:
            raise ValueError("Sales final invoice item not found")
        if order_item is None:
            order_item = SalesOrderItem(
                sales_order_id=pending_order.id,
                product_id=execution.product_id,
                batch_number=invoice_item.batch_number,
                quantity=shortfall,
                unit_price=Decimal(invoice_item.selling_price or 0),
                selling_price=invoice_item.selling_price,
                gst_percent=invoice_item.gst_percent,
                discount_percent=invoice_item.discount_percent,
            )
            session.add(order_item)
            await session.flush()
        else:
            order_item.quantity = Decimal(order_item.quantity or 0) + shortfall

        session.add(
            InvoiceShortfallReturn(
                batch_invoice_id=batch_invoice_id,
                sales_final_invoice_item_id=execution.sales_final_invoice_item_id,
                returned_sales_order_id=pending_order.id,
                returned_sales_order_item_id=order_item.id,
                product_id=execution.product_id,
                quantity=shortfall,
                reason=execution.shortfall_reason,
            )
        )
        pending_order.status = "pending"


async def _eligible_packers_and_supervisor(session: AsyncSession, warehouse_id: uuid.UUID) -> tuple[list[tuple[Employee, User]], tuple[Employee, User]]:
    employee_stmt = (
        select(Employee, User)
        .join(User, User.employee_id == Employee.id)
        .where(
            Employee.warehouse_id == warehouse_id,
            Employee.is_active.is_(True),
            User.is_active.is_(True),
            Employee.role.in_([EmployeeRole.PACKER, EmployeeRole.SUPERVISOR]),
        )
    )
    rows = (await session.execute(employee_stmt)).all()
    packers: list[tuple[Employee, User]] = []
    supervisors: list[tuple[Employee, User]] = []
    for employee, user in rows:
        if employee.role == EmployeeRole.PACKER:
            packers.append((employee, user))
        elif employee.role == EmployeeRole.SUPERVISOR:
            supervisors.append((employee, user))
    if not packers:
        raise ValueError("No active packers with portal users found for the selected warehouse")
    if len(supervisors) != 1:
        raise ValueError("Exactly one active supervisor with portal user is required for the selected warehouse")
    return packers, supervisors[0]


async def _load_invoice_weights(session: AsyncSession, invoice_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    stmt = (
        select(
            SalesFinalInvoiceItem.sales_final_invoice_id,
            Product.name,
            Product.weight_in_grams,
            SalesFinalInvoiceItem.quantity,
        )
        .join(Product, Product.id == SalesFinalInvoiceItem.product_id)
        .where(SalesFinalInvoiceItem.sales_final_invoice_id.in_(invoice_ids))
    )
    rows = (await session.execute(stmt)).all()
    weights: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))
    missing: dict[uuid.UUID, list[str]] = defaultdict(list)
    for invoice_id, product_name, weight_in_grams, quantity in rows:
        weight = Decimal(weight_in_grams or 0)
        if weight <= 0:
            missing[invoice_id].append(product_name)
            continue
        weights[invoice_id] += weight * Decimal(quantity or 0)
    if missing:
        details = []
        for invoice_id, names in missing.items():
            details.append(f"invoice {invoice_id}: {', '.join(sorted(set(names)))}")
        raise ValueError("Missing product weight for " + "; ".join(details))
    return weights


async def _build_workflow_invoice_response(session: AsyncSession, batch_invoice: InvoiceAssignmentBatchInvoice) -> dict[str, object]:
    invoice_stmt = (
        select(
            SalesFinalInvoice.id,
            SalesFinalInvoice.invoice_number,
            SalesFinalInvoice.invoice_date,
            SalesFinalInvoice.total_amount,
            SalesOrder.customer_id,
            Customer.name,
            SalesOrder.warehouse_id,
            Warehouse.name,
            Employee.id,
            Employee.full_name,
        )
        .select_from(SalesFinalInvoice)
        .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
        .join(Customer, Customer.id == SalesOrder.customer_id)
        .join(Warehouse, Warehouse.id == SalesOrder.warehouse_id)
        .join(Employee, Employee.id == batch_invoice.assigned_packer_id)
        .where(SalesFinalInvoice.id == batch_invoice.sales_final_invoice_id)
    )
    invoice_row = (await session.execute(invoice_stmt)).first()
    if invoice_row is None:
        raise ValueError("Sales final invoice not found")
    supervisor = await session.get(Employee, batch_invoice.assigned_supervisor_id)
    output = (
        await session.execute(select(InvoicePackingOutput).where(InvoicePackingOutput.batch_invoice_id == batch_invoice.id))
    ).scalar_one_or_none()
    item_stmt = (
        select(
            SalesFinalInvoiceItem.id,
            SalesFinalInvoiceItem.product_id,
            SalesFinalInvoiceItem.quantity,
            SalesFinalInvoiceItem.selling_price,
            Product.sku,
            Product.name,
            Product.unit,
            Product.conv_2_to_1,
            Product.conv_3_to_1,
            Product.conv_3_to_2,
            Product.weight_in_grams,
            Pricing.mrp,
            InvoiceExecutionItem.id,
            InvoiceExecutionItem.actual_quantity,
            InvoiceExecutionItem.shortfall_quantity,
            InvoiceExecutionItem.shortfall_reason,
            InvoiceExecutionItem.supervisor_decision,
            InvoiceExecutionItem.supervisor_note,
        )
        .select_from(SalesFinalInvoiceItem)
        .join(Product, Product.id == SalesFinalInvoiceItem.product_id)
        .outerjoin(Pricing, Pricing.product_id == Product.id)
        .outerjoin(
            InvoiceExecutionItem,
            (InvoiceExecutionItem.sales_final_invoice_item_id == SalesFinalInvoiceItem.id)
            & (InvoiceExecutionItem.batch_invoice_id == batch_invoice.id),
        )
        .where(SalesFinalInvoiceItem.sales_final_invoice_id == batch_invoice.sales_final_invoice_id)
        .order_by(Product.name.asc())
    )
    item_rows = (await session.execute(item_stmt)).all()
    items: list[dict[str, object]] = []
    total_weight = Decimal("0")
    for row in item_rows:
        conv_2_to_1 = row[7]
        conv_3_to_1 = row[8]
        conv_3_to_2 = row[9]
        weight_in_grams = row[10]
        mrp = row[11]
        actual = Decimal(row[13] if row[13] is not None else row[2])
        shortfall = Decimal(row[14] or 0)
        total_weight += Decimal(weight_in_grams or 0) * Decimal(row[2] or 0)
        case_size = None
        for value in (conv_3_to_1, conv_2_to_1, conv_3_to_2):
            numeric = Decimal(value or 0)
            if numeric > 0:
                case_size = numeric
                break
        items.append(
            {
                "execution_item_id": row[12],
                "sales_final_invoice_item_id": row[0],
                "product_id": row[1],
                "sku": row[4],
                "product_name": row[5],
                "unit": row[6],
                "mrp": mrp,
                "quantity": row[2],
                "actual_quantity": actual,
                "shortfall_quantity": shortfall,
                "shortfall_reason": row[15],
                "supervisor_decision": row[16],
                "supervisor_note": row[17],
                "case_size": case_size,
            }
        )
    return {
        "batch_invoice_id": batch_invoice.id,
        "sales_final_invoice_id": invoice_row[0],
        "invoice_number": invoice_row[1],
        "invoice_date": invoice_row[2],
        "customer_id": invoice_row[4],
        "customer_name": invoice_row[5],
        "warehouse_id": invoice_row[6],
        "warehouse_name": invoice_row[7],
        "assigned_packer_id": batch_invoice.assigned_packer_id,
        "assigned_packer_name": invoice_row[9],
        "assigned_supervisor_id": batch_invoice.assigned_supervisor_id,
        "assigned_supervisor_name": supervisor.full_name if supervisor else "-",
        "total_weight_grams": total_weight,
        "total_amount": invoice_row[3],
        "status": batch_invoice.status,
        "requested_verification_at": batch_invoice.requested_verification_at.isoformat() if batch_invoice.requested_verification_at else None,
        "verified_at": batch_invoice.verified_at.isoformat() if batch_invoice.verified_at else None,
        "rejected_at": batch_invoice.rejected_at.isoformat() if batch_invoice.rejected_at else None,
        "rejection_note": batch_invoice.rejection_note,
        "ready_for_dispatch_at": batch_invoice.ready_for_dispatch_at.isoformat() if batch_invoice.ready_for_dispatch_at else None,
        "total_boxes_or_bags": output.total_boxes_or_bags if output else None,
        "loose_cases": output.loose_cases if output else None,
        "full_cases": output.full_cases if output else None,
        "packing_note": output.packing_note if output else None,
        "items": items,
    }


async def _refresh_batch_status(session: AsyncSession, batch_id: uuid.UUID) -> str:
    batch = await session.get(InvoiceAssignmentBatch, batch_id)
    if batch is None:
        raise ValueError("Workflow batch not found")
    rows = (
        await session.execute(select(InvoiceAssignmentBatchInvoice.status).where(InvoiceAssignmentBatchInvoice.batch_id == batch_id))
    ).scalars().all()
    statuses = {_normalize_status(status) for status in rows}
    if statuses == {InvoiceWorkflowStatus.READY_TO_DISPATCH.value}:
        batch.status = InvoiceWorkflowStatus.READY_TO_DISPATCH.value
    elif statuses == {InvoiceWorkflowStatus.PACKING_STARTED.value}:
        batch.status = InvoiceWorkflowStatus.PACKING_STARTED.value
    elif statuses == {InvoiceWorkflowStatus.VERIFICATION_PENDING.value}:
        batch.status = InvoiceWorkflowStatus.VERIFICATION_PENDING.value
    elif statuses and statuses.issubset({InvoiceWorkflowStatus.PACKERS_ASSIGNED.value, InvoiceWorkflowStatus.VERIFICATION_PENDING.value}):
        batch.status = InvoiceWorkflowStatus.PACKERS_ASSIGNED.value
    return batch.status


async def assign_invoices_to_packers(
    session: AsyncSession,
    *,
    invoice_ids: list[uuid.UUID],
    created_by_user_id: uuid.UUID | None,
) -> dict[str, object]:
    distinct_ids = list(dict.fromkeys(invoice_ids))
    if not distinct_ids:
        raise ValueError("At least one invoice is required")

    stmt = (
        select(SalesFinalInvoice.id, SalesOrder.warehouse_id, SalesFinalInvoice.invoice_number)
        .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
        .where(SalesFinalInvoice.id.in_(distinct_ids), SalesFinalInvoice.deleted_at.is_(None))
    )
    rows = (await session.execute(stmt)).all()
    if len(rows) != len(distinct_ids):
        raise ValueError("One or more selected invoices were not found")
    warehouse_ids = {row[1] for row in rows}
    if len(warehouse_ids) != 1:
        raise ValueError("All selected invoices must belong to the same warehouse")
    warehouse_id = next(iter(warehouse_ids))

    active_stmt = (
        select(InvoiceAssignmentBatchInvoice.sales_final_invoice_id)
        .where(
            InvoiceAssignmentBatchInvoice.sales_final_invoice_id.in_(distinct_ids),
            InvoiceAssignmentBatchInvoice.status.in_(ACTIVE_WORKFLOW_STATUSES),
        )
    )
    active_rows = (await session.execute(active_stmt)).scalars().all()
    if active_rows:
        raise ValueError("One or more invoices are already in an active packing workflow")

    weights = await _load_invoice_weights(session, distinct_ids)
    packers, supervisor = await _eligible_packers_and_supervisor(session, warehouse_id)

    batch = InvoiceAssignmentBatch(
        warehouse_id=warehouse_id,
        batch_code=_batch_code(),
        created_by_user_id=created_by_user_id,
        status=InvoiceWorkflowStatus.PACKERS_ASSIGNED.value,
    )
    session.add(batch)
    await session.flush()

    loads: dict[uuid.UUID, Decimal] = {employee.id: Decimal("0") for employee, _user in packers}
    packer_users = {employee.id: user.id for employee, user in packers}
    invoice_order = sorted(distinct_ids, key=lambda invoice_id: weights.get(invoice_id, Decimal("0")), reverse=True)
    for invoice_id in invoice_order:
        chosen_packer_id = min(loads.items(), key=lambda item: (item[1], str(item[0])))[0]
        loads[chosen_packer_id] += weights.get(invoice_id, Decimal("0"))
        workflow_invoice = InvoiceAssignmentBatchInvoice(
            batch_id=batch.id,
            sales_final_invoice_id=invoice_id,
            assigned_packer_id=chosen_packer_id,
            assigned_supervisor_id=supervisor[0].id,
            status=InvoiceWorkflowStatus.PACKERS_ASSIGNED.value,
        )
        session.add(workflow_invoice)
        invoice = next(row for row in rows if row[0] == invoice_id)
        final_invoice = await session.get(SalesFinalInvoice, invoice_id)
        if final_invoice is not None:
            final_invoice.delivery_status = InvoiceWorkflowStatus.PACKERS_ASSIGNED.value
        await _create_notification(
            session,
            user_id=packer_users[chosen_packer_id],
            notification_type=NotificationType.PACKER_ASSIGNMENT.value,
            title="Invoices assigned for packing",
            message=f"Batch {batch.batch_code} includes invoice {invoice[2]} assigned to you.",
            entity_type="invoice_assignment_batch",
            entity_id=batch.id,
        )
    await session.commit()
    return {
        "batch_id": str(batch.id),
        "batch_code": batch.batch_code,
        "status": batch.status,
        "invoice_count": len(distinct_ids),
    }


async def list_batches(session: AsyncSession, *, warehouse_id: uuid.UUID | None = None, status_filter: str | None = None) -> list[dict[str, object]]:
    stmt = select(InvoiceAssignmentBatch, Warehouse.name).join(Warehouse, Warehouse.id == InvoiceAssignmentBatch.warehouse_id)
    if warehouse_id is not None:
        stmt = stmt.where(InvoiceAssignmentBatch.warehouse_id == warehouse_id)
    if status_filter:
        stmt = stmt.where(InvoiceAssignmentBatch.status == _normalize_status(status_filter))
    stmt = stmt.order_by(InvoiceAssignmentBatch.created_at.desc())
    rows = (await session.execute(stmt)).all()
    result: list[dict[str, object]] = []
    for batch, warehouse_name in rows:
        count_stmt = select(func.count()).select_from(InvoiceAssignmentBatchInvoice).where(InvoiceAssignmentBatchInvoice.batch_id == batch.id)
        count = (await session.execute(count_stmt)).scalar_one()
        result.append(
            {
                "batch_id": batch.id,
                "batch_code": batch.batch_code,
                "warehouse_id": batch.warehouse_id,
                "warehouse_name": warehouse_name,
                "status": batch.status,
                "created_at": batch.created_at.isoformat(),
                "invoice_count": int(count),
            }
        )
    return result


async def get_batch_detail(session: AsyncSession, batch_id: uuid.UUID) -> dict[str, object]:
    batch_row = (
        await session.execute(
            select(InvoiceAssignmentBatch, Warehouse.name)
            .join(Warehouse, Warehouse.id == InvoiceAssignmentBatch.warehouse_id)
            .where(InvoiceAssignmentBatch.id == batch_id)
        )
    ).first()
    if batch_row is None:
        raise ValueError("Workflow batch not found")
    batch, warehouse_name = batch_row
    workflow_invoices = (
        await session.execute(
            select(InvoiceAssignmentBatchInvoice)
            .where(InvoiceAssignmentBatchInvoice.batch_id == batch_id)
            .order_by(InvoiceAssignmentBatchInvoice.created_at.asc())
        )
    ).scalars().all()
    invoices = [await _build_workflow_invoice_response(session, workflow_invoice) for workflow_invoice in workflow_invoices]
    return {
        "batch_id": batch.id,
        "batch_code": batch.batch_code,
        "warehouse_id": batch.warehouse_id,
        "warehouse_name": warehouse_name,
        "status": batch.status,
        "created_at": batch.created_at.isoformat(),
        "invoice_count": len(invoices),
        "invoices": invoices,
    }


async def get_batch_invoice_detail(session: AsyncSession, batch_invoice_id: uuid.UUID) -> dict[str, object]:
    workflow_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if workflow_invoice is None:
        raise ValueError("Workflow invoice not found")
    return await _build_workflow_invoice_response(session, workflow_invoice)


async def update_execution_items(session: AsyncSession, *, batch_invoice_id: uuid.UUID, items: list[dict[str, object]], employee_id: uuid.UUID) -> dict[str, object]:
    batch_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if batch_invoice is None:
        raise ValueError("Workflow invoice not found")
    if batch_invoice.assigned_packer_id != employee_id:
        raise ValueError("This invoice is not assigned to the current packer")
    if _normalize_status(batch_invoice.status) != InvoiceWorkflowStatus.PACKERS_ASSIGNED.value:
        raise ValueError("Execution can only be updated while invoice is assigned to packer")

    invoice_item_rows = (
        await session.execute(
            select(SalesFinalInvoiceItem).where(SalesFinalInvoiceItem.sales_final_invoice_id == batch_invoice.sales_final_invoice_id)
        )
    ).scalars().all()
    invoice_items = {row.id: row for row in invoice_item_rows}
    seen_ids: set[uuid.UUID] = set()
    for item in items:
        invoice_item_id = item["sales_final_invoice_item_id"]
        if invoice_item_id in seen_ids:
            raise ValueError("Duplicate invoice item in execution payload")
        seen_ids.add(invoice_item_id)
        invoice_item = invoice_items.get(invoice_item_id)
        if invoice_item is None:
            raise ValueError("Invoice item not found in selected invoice")
        original_qty = Decimal(invoice_item.quantity or 0)
        actual_qty = Decimal(item["actual_quantity"])
        if actual_qty < 0 or actual_qty > original_qty:
            raise ValueError(f"Actual quantity must be between 0 and {original_qty} for item {invoice_item_id}")
        shortfall = original_qty - actual_qty
        reason = _normalize_reason(item.get("shortfall_reason"))
        if shortfall > 0 and reason is None:
            raise ValueError(f"Shortfall reason is required for item {invoice_item_id}")
        if shortfall <= 0:
            reason = None
        existing = (
            await session.execute(
                select(InvoiceExecutionItem).where(
                    InvoiceExecutionItem.batch_invoice_id == batch_invoice_id,
                    InvoiceExecutionItem.sales_final_invoice_item_id == invoice_item_id,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            existing = InvoiceExecutionItem(
                batch_invoice_id=batch_invoice_id,
                sales_final_invoice_item_id=invoice_item_id,
                product_id=invoice_item.product_id,
                original_quantity=original_qty,
                actual_quantity=actual_qty,
                shortfall_quantity=shortfall,
                shortfall_reason=reason,
            )
            session.add(existing)
        else:
            existing.product_id = invoice_item.product_id
            existing.original_quantity = original_qty
            existing.actual_quantity = actual_qty
            existing.shortfall_quantity = shortfall
            existing.shortfall_reason = reason
            existing.supervisor_decision = None
            existing.supervisor_note = None
    await session.commit()
    return await _build_workflow_invoice_response(session, batch_invoice)


async def request_verification(session: AsyncSession, *, batch_invoice_id: uuid.UUID, employee_id: uuid.UUID) -> dict[str, object]:
    batch_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if batch_invoice is None:
        raise ValueError("Workflow invoice not found")
    if batch_invoice.assigned_packer_id != employee_id:
        raise ValueError("This invoice is not assigned to the current packer")
    if _normalize_status(batch_invoice.status) != InvoiceWorkflowStatus.PACKERS_ASSIGNED.value:
        raise ValueError("Invoice is not in packer-assigned state")

    invoice_items = (
        await session.execute(select(SalesFinalInvoiceItem).where(SalesFinalInvoiceItem.sales_final_invoice_id == batch_invoice.sales_final_invoice_id))
    ).scalars().all()
    existing_rows = (
        await session.execute(select(InvoiceExecutionItem).where(InvoiceExecutionItem.batch_invoice_id == batch_invoice_id))
    ).scalars().all()
    existing_map = {row.sales_final_invoice_item_id: row for row in existing_rows}
    for invoice_item in invoice_items:
        if invoice_item.id not in existing_map:
            session.add(
                InvoiceExecutionItem(
                    batch_invoice_id=batch_invoice_id,
                    sales_final_invoice_item_id=invoice_item.id,
                    product_id=invoice_item.product_id,
                    original_quantity=invoice_item.quantity,
                    actual_quantity=invoice_item.quantity,
                    shortfall_quantity=Decimal("0"),
                    shortfall_reason=None,
                )
            )
    await session.flush()
    await _reverse_shortfall_returns(session, batch_invoice_id)
    await _apply_shortfall_returns(session, batch_invoice_id)
    batch_invoice.status = InvoiceWorkflowStatus.VERIFICATION_PENDING.value
    batch_invoice.requested_verification_at = _utcnow()
    final_invoice = await session.get(SalesFinalInvoice, batch_invoice.sales_final_invoice_id)
    if final_invoice is not None:
        final_invoice.delivery_status = InvoiceWorkflowStatus.VERIFICATION_PENDING.value
    batch_status = await _refresh_batch_status(session, batch_invoice.batch_id)
    if batch_status == InvoiceWorkflowStatus.VERIFICATION_PENDING.value:
        supervisor_user = (
            await session.execute(select(User).where(User.employee_id == batch_invoice.assigned_supervisor_id, User.is_active.is_(True)).limit(1))
        ).scalar_one_or_none()
        batch = await session.get(InvoiceAssignmentBatch, batch_invoice.batch_id)
        if supervisor_user is not None and batch is not None:
            await _create_notification(
                session,
                user_id=supervisor_user.id,
                notification_type=NotificationType.SUPERVISOR_REVIEW.value,
                title="Verification required",
                message=f"Batch {batch.batch_code} is ready for supervisor verification.",
                entity_type="invoice_assignment_batch",
                entity_id=batch.id,
            )
    await session.commit()
    return await _build_workflow_invoice_response(session, batch_invoice)


async def verify_batch_invoice(session: AsyncSession, *, batch_invoice_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> dict[str, object]:
    batch_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if batch_invoice is None:
        raise ValueError("Workflow invoice not found")
    if _normalize_status(batch_invoice.status) != InvoiceWorkflowStatus.VERIFICATION_PENDING.value:
        raise ValueError("Invoice is not awaiting verification")
    execution_rows = (
        await session.execute(select(InvoiceExecutionItem).where(InvoiceExecutionItem.batch_invoice_id == batch_invoice_id))
    ).scalars().all()
    for row in execution_rows:
        row.supervisor_decision = SupervisorDecision.VERIFIED.value
        row.supervisor_note = note
    batch_invoice.status = InvoiceWorkflowStatus.PACKING_STARTED.value
    batch_invoice.verified_at = _utcnow()
    batch_invoice.verified_by = user_id
    batch_invoice.rejected_at = None
    batch_invoice.rejected_by = None
    batch_invoice.rejection_note = None
    final_invoice = await session.get(SalesFinalInvoice, batch_invoice.sales_final_invoice_id)
    if final_invoice is not None:
        final_invoice.delivery_status = InvoiceWorkflowStatus.PACKING_STARTED.value
    batch_status = await _refresh_batch_status(session, batch_invoice.batch_id)
    if batch_status == InvoiceWorkflowStatus.PACKING_STARTED.value:
        batch = await session.get(InvoiceAssignmentBatch, batch_invoice.batch_id)
        batch_invoices = (
            await session.execute(select(InvoiceAssignmentBatchInvoice).where(InvoiceAssignmentBatchInvoice.batch_id == batch_invoice.batch_id))
        ).scalars().all()
        packer_ids = {row.assigned_packer_id for row in batch_invoices}
        users = (
            await session.execute(select(User).where(User.employee_id.in_(packer_ids), User.is_active.is_(True)))
        ).scalars().all()
        if batch is not None:
            for user in users:
                await _create_notification(
                    session,
                    user_id=user.id,
                    notification_type=NotificationType.PACKING_START.value,
                    title="Start packing",
                    message=f"Batch {batch.batch_code} has been verified. You can start packing now.",
                    entity_type="invoice_assignment_batch",
                    entity_id=batch.id,
                )
    await session.commit()
    return await _build_workflow_invoice_response(session, batch_invoice)


async def reject_batch_invoice(session: AsyncSession, *, batch_invoice_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> dict[str, object]:
    batch_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if batch_invoice is None:
        raise ValueError("Workflow invoice not found")
    if _normalize_status(batch_invoice.status) != InvoiceWorkflowStatus.VERIFICATION_PENDING.value:
        raise ValueError("Invoice is not awaiting verification")
    await _reverse_shortfall_returns(session, batch_invoice_id)
    execution_rows = (
        await session.execute(select(InvoiceExecutionItem).where(InvoiceExecutionItem.batch_invoice_id == batch_invoice_id))
    ).scalars().all()
    for row in execution_rows:
        row.actual_quantity = row.original_quantity
        row.shortfall_quantity = Decimal("0")
        row.shortfall_reason = None
        row.supervisor_decision = None
        row.supervisor_note = None
    batch_invoice.status = InvoiceWorkflowStatus.PACKERS_ASSIGNED.value
    batch_invoice.rejected_at = _utcnow()
    batch_invoice.rejected_by = user_id
    batch_invoice.rejection_note = note
    batch_invoice.requested_verification_at = None
    batch_invoice.verified_at = None
    batch_invoice.verified_by = None
    final_invoice = await session.get(SalesFinalInvoice, batch_invoice.sales_final_invoice_id)
    if final_invoice is not None:
        final_invoice.delivery_status = InvoiceWorkflowStatus.PACKERS_ASSIGNED.value
    await _refresh_batch_status(session, batch_invoice.batch_id)
    packer_user = (
        await session.execute(select(User).where(User.employee_id == batch_invoice.assigned_packer_id, User.is_active.is_(True)).limit(1))
    ).scalar_one_or_none()
    batch = await session.get(InvoiceAssignmentBatch, batch_invoice.batch_id)
    if packer_user is not None and batch is not None:
        await _create_notification(
            session,
            user_id=packer_user.id,
            notification_type=NotificationType.PACKER_REASSIGNED.value,
            title="Verification rejected",
            message=f"Batch {batch.batch_code} invoice was rejected. Update the quantities and resubmit.",
            entity_type="invoice_assignment_batch",
            entity_id=batch.id,
        )
    await session.commit()
    return await _build_workflow_invoice_response(session, batch_invoice)


async def update_packing_output(session: AsyncSession, *, batch_invoice_id: uuid.UUID, employee_id: uuid.UUID, total_boxes_or_bags: int, loose_cases: int, full_cases: int, packing_note: str | None) -> dict[str, object]:
    batch_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if batch_invoice is None:
        raise ValueError("Workflow invoice not found")
    if batch_invoice.assigned_packer_id != employee_id:
        raise ValueError("This invoice is not assigned to the current packer")
    if _normalize_status(batch_invoice.status) != InvoiceWorkflowStatus.PACKING_STARTED.value:
        raise ValueError("Packing output can only be updated when packing has started")
    existing = (
        await session.execute(select(InvoicePackingOutput).where(InvoicePackingOutput.batch_invoice_id == batch_invoice_id))
    ).scalar_one_or_none()
    if existing is None:
        existing = InvoicePackingOutput(
            batch_invoice_id=batch_invoice_id,
            total_boxes_or_bags=total_boxes_or_bags,
            loose_cases=loose_cases,
            full_cases=full_cases,
            packing_note=packing_note,
        )
        session.add(existing)
    else:
        existing.total_boxes_or_bags = total_boxes_or_bags
        existing.loose_cases = loose_cases
        existing.full_cases = full_cases
        existing.packing_note = packing_note
    await session.commit()
    return await _build_workflow_invoice_response(session, batch_invoice)


async def mark_ready_for_dispatch(session: AsyncSession, *, batch_invoice_id: uuid.UUID, employee_id: uuid.UUID) -> dict[str, object]:
    batch_invoice = await session.get(InvoiceAssignmentBatchInvoice, batch_invoice_id)
    if batch_invoice is None:
        raise ValueError("Workflow invoice not found")
    if batch_invoice.assigned_packer_id != employee_id:
        raise ValueError("This invoice is not assigned to the current packer")
    if _normalize_status(batch_invoice.status) != InvoiceWorkflowStatus.PACKING_STARTED.value:
        raise ValueError("Invoice is not in packing-started state")
    output = (
        await session.execute(select(InvoicePackingOutput).where(InvoicePackingOutput.batch_invoice_id == batch_invoice_id))
    ).scalar_one_or_none()
    if output is None:
        raise ValueError("Packing output must be recorded before moving to vehicle allocation")
    batch_invoice.status = InvoiceWorkflowStatus.READY_TO_DISPATCH.value
    batch_invoice.ready_for_dispatch_at = _utcnow()
    final_invoice = await session.get(SalesFinalInvoice, batch_invoice.sales_final_invoice_id)
    if final_invoice is not None:
        final_invoice.delivery_status = InvoiceWorkflowStatus.READY_TO_DISPATCH.value
    batch_status = await _refresh_batch_status(session, batch_invoice.batch_id)
    if batch_status == InvoiceWorkflowStatus.READY_TO_DISPATCH.value:
        batch = await session.get(InvoiceAssignmentBatch, batch_invoice.batch_id)
        admin_users = (
            await session.execute(select(User).where(User.account_type == AccountType.SYSTEM, User.is_active.is_(True)))
        ).scalars().all()
        if batch is not None:
            for user in admin_users:
                await _create_notification(
                    session,
                    user_id=user.id,
                    notification_type=NotificationType.ADMIN_READY_TO_DISPATCH.value,
                    title="Batch ready for dispatch",
                    message=f"Batch {batch.batch_code} is ready for vehicle allocation.",
                    entity_type="invoice_assignment_batch",
                    entity_id=batch.id,
                )
    await session.commit()
    return await _build_workflow_invoice_response(session, batch_invoice)


async def my_packing_batches(session: AsyncSession, *, employee_id: uuid.UUID) -> list[dict[str, object]]:
    stmt = (
        select(InvoiceAssignmentBatch)
        .join(InvoiceAssignmentBatchInvoice, InvoiceAssignmentBatchInvoice.batch_id == InvoiceAssignmentBatch.id)
        .where(
            InvoiceAssignmentBatchInvoice.assigned_packer_id == employee_id,
            InvoiceAssignmentBatchInvoice.status.in_(ACTIVE_WORKFLOW_STATUSES),
        )
        .group_by(InvoiceAssignmentBatch.id)
        .order_by(InvoiceAssignmentBatch.created_at.desc())
    )
    batches = (await session.execute(stmt)).scalars().all()
    return [await get_batch_detail(session, batch.id) for batch in batches]


async def supervisor_batches(session: AsyncSession, *, employee_id: uuid.UUID) -> list[dict[str, object]]:
    stmt = (
        select(InvoiceAssignmentBatch)
        .join(InvoiceAssignmentBatchInvoice, InvoiceAssignmentBatchInvoice.batch_id == InvoiceAssignmentBatch.id)
        .where(
            InvoiceAssignmentBatchInvoice.assigned_supervisor_id == employee_id,
            InvoiceAssignmentBatchInvoice.status == InvoiceWorkflowStatus.VERIFICATION_PENDING.value,
        )
        .group_by(InvoiceAssignmentBatch.id)
        .order_by(InvoiceAssignmentBatch.created_at.desc())
    )
    batches = (await session.execute(stmt)).scalars().all()
    return [await get_batch_detail(session, batch.id) for batch in batches]


async def list_notifications(session: AsyncSession, *, user_id: uuid.UUID, unread_only: bool = False, limit: int = 20) -> list[dict[str, object]]:
    stmt = select(UserNotification).where(UserNotification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(UserNotification.is_read.is_(False))
    stmt = stmt.order_by(UserNotification.created_at.desc()).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": row.id,
            "type": row.type,
            "title": row.title,
            "message": row.message,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "is_read": bool(row.is_read),
            "created_at": row.created_at.isoformat(),
            "read_at": row.read_at.isoformat() if row.read_at else None,
        }
        for row in rows
    ]


async def mark_notifications_read(session: AsyncSession, *, user_id: uuid.UUID, notification_ids: list[uuid.UUID] | None = None) -> int:
    stmt = select(UserNotification).where(UserNotification.user_id == user_id, UserNotification.is_read.is_(False))
    if notification_ids:
        stmt = stmt.where(UserNotification.id.in_(notification_ids))
    rows = (await session.execute(stmt)).scalars().all()
    now = _utcnow()
    for row in rows:
        row.is_read = True
        row.read_at = now
    await session.commit()
    return len(rows)


def _haversine_meters(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> Decimal:
    radius = 6371000.0
    phi1 = math.radians(origin_lat)
    phi2 = math.radians(dest_lat)
    delta_phi = math.radians(dest_lat - origin_lat)
    delta_lambda = math.radians(dest_lng - origin_lng)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return Decimal(str(round(radius * c, 2)))


def _build_fallback_route(
    *,
    warehouse_lat: Decimal,
    warehouse_lng: Decimal,
    stops: list[dict[str, object]],
) -> dict[str, object]:
    remaining = list(stops)
    current_lat = float(warehouse_lat)
    current_lng = float(warehouse_lng)
    ordered: list[dict[str, object]] = []
    total_duration = 0

    while remaining:
        nearest = min(
            remaining,
            key=lambda stop: _haversine_meters(
                current_lat,
                current_lng,
                float(stop["customer_latitude"]),
                float(stop["customer_longitude"]),
            ),
        )
        distance = _haversine_meters(
            current_lat,
            current_lng,
            float(nearest["customer_latitude"]),
            float(nearest["customer_longitude"]),
        )
        duration_seconds = int((float(distance) / 1000.0) / 28.0 * 3600) if distance > 0 else 0
        total_duration += duration_seconds
        ordered.append(
            {
                **nearest,
                "distance_meters": distance,
                "duration_seconds": duration_seconds,
            }
        )
        current_lat = float(nearest["customer_latitude"])
        current_lng = float(nearest["customer_longitude"])
        remaining = [stop for stop in remaining if stop["sales_final_invoice_id"] != nearest["sales_final_invoice_id"]]

    return {
        "provider": "HAVERSINE_FALLBACK",
        "optimized": True,
        "total_duration_seconds": total_duration,
        "google_maps_url": _build_maps_browser_url(
            warehouse_lat=warehouse_lat,
            warehouse_lng=warehouse_lng,
            ordered_stops=ordered,
        ),
        "stops": ordered,
    }


async def _build_google_maps_route(
    *,
    warehouse_lat: Decimal,
    warehouse_lng: Decimal,
    stops: list[dict[str, object]],
) -> dict[str, object] | None:
    if not settings.google_maps_api_key or not stops:
        return None

    origin = _coord_str(warehouse_lat, warehouse_lng)
    waypoint_values = [
        _coord_str(stop["customer_latitude"], stop["customer_longitude"])
        for stop in stops
    ]
    params = {
        "origin": origin,
        "destination": origin,
        "waypoints": "|".join(["optimize:true", *waypoint_values]),
        "mode": "driving",
        "key": settings.google_maps_api_key,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get("https://maps.googleapis.com/maps/api/directions/json", params=params)
        response.raise_for_status()
        payload = response.json()

    if payload.get("status") != "OK":
        return None
    routes = payload.get("routes") or []
    if not routes:
        return None
    route = routes[0]
    waypoint_order = route.get("waypoint_order") or list(range(len(stops)))
    if len(waypoint_order) != len(stops):
        return None

    ordered = [dict(stops[index]) for index in waypoint_order]
    legs = route.get("legs") or []
    total_duration = 0
    for index, stop in enumerate(ordered):
        leg = legs[index] if index < len(legs) else {}
        distance_value = ((leg.get("distance") or {}).get("value")) or 0
        duration_value = ((leg.get("duration") or {}).get("value")) or 0
        stop["distance_meters"] = Decimal(distance_value)
        stop["duration_seconds"] = int(duration_value)
        total_duration += int(duration_value)

    return {
        "provider": "GOOGLE_MAPS",
        "optimized": True,
        "total_duration_seconds": total_duration,
        "google_maps_url": _build_maps_browser_url(
            warehouse_lat=warehouse_lat,
            warehouse_lng=warehouse_lng,
            ordered_stops=ordered,
        ),
        "overview_polyline": ((route.get("overview_polyline") or {}).get("points")),
        "raw_response": payload,
        "stops": ordered,
    }


def _documents_ready(invoice: SalesFinalInvoice) -> bool:
    return bool(
        (invoice.e_invoice_number or "").strip()
        and (invoice.gst_invoice_number or "").strip()
        and (invoice.eway_bill_number or "").strip()
    )


async def _load_delivery_run_response(session: AsyncSession, run_id: uuid.UUID, *, include_items: bool = False) -> dict[str, object]:
    run = await session.get(DeliveryRun, run_id)
    if run is None:
        raise ValueError("Delivery run not found")

    warehouse = await session.get(Warehouse, run.warehouse_id)
    vehicle = await session.get(Vehicle, run.vehicle_id) if run.vehicle_id else None
    employees = {}
    for employee_id in [run.driver_id, run.in_vehicle_employee_id, run.bill_manager_id, run.loader_id]:
        if employee_id and employee_id not in employees:
            employees[employee_id] = await session.get(Employee, employee_id)

    source_batch_rows = (
        await session.execute(
            select(DeliveryRunSourceBatch).where(DeliveryRunSourceBatch.delivery_run_id == run.id)
        )
    ).scalars().all()
    source_batch_ids = [row.invoice_assignment_batch_id for row in source_batch_rows]
    route_payload: dict[str, object] = {}
    if run.optimized_route_payload:
        try:
            parsed = json.loads(run.optimized_route_payload)
            if isinstance(parsed, dict):
                route_payload = parsed
        except json.JSONDecodeError:
            route_payload = {}

    stop_rows = (
        await session.execute(
            select(DeliveryRunStop)
            .where(DeliveryRunStop.delivery_run_id == run.id)
            .order_by(
                DeliveryRunStop.sequence_no.asc().nullslast(),
                DeliveryRunStop.stop_sequence.asc().nullslast(),
                DeliveryRunStop.created_at.asc() if hasattr(DeliveryRunStop, "created_at") else DeliveryRunStop.id.asc(),
            )
        )
    ).scalars().all()
    stops_payload: list[dict[str, object]] = []
    for stop in stop_rows:
        invoice = await session.get(SalesFinalInvoice, stop.sales_final_invoice_id) if stop.sales_final_invoice_id else None
        if invoice is None:
            continue
        customer = await session.get(Customer, invoice.customer_id)
        weight_map = await _load_invoice_weights(session, [invoice.id])
        packing_output = (
            await session.execute(
                select(InvoicePackingOutput)
                .join(InvoiceAssignmentBatchInvoice, InvoiceAssignmentBatchInvoice.id == InvoicePackingOutput.batch_invoice_id)
                .where(InvoiceAssignmentBatchInvoice.sales_final_invoice_id == invoice.id)
                .order_by(InvoicePackingOutput.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        items_payload = None
        if include_items:
            items_payload = []
            invoice_items = (
                await session.execute(
                    select(SalesFinalInvoiceItem, Product)
                    .join(Product, Product.id == SalesFinalInvoiceItem.product_id)
                    .where(SalesFinalInvoiceItem.sales_final_invoice_id == invoice.id)
                )
            ).all()
            for invoice_item, product in invoice_items:
                items_payload.append(
                    {
                        "execution_item_id": None,
                        "sales_final_invoice_item_id": invoice_item.id,
                        "product_id": product.id,
                        "sku": product.sku,
                        "product_name": product.name,
                        "unit": product.unit or "-",
                        "mrp": product.mrp,
                        "quantity": invoice_item.quantity,
                        "actual_quantity": invoice_item.quantity,
                        "shortfall_quantity": Decimal("0"),
                        "shortfall_reason": None,
                        "supervisor_decision": None,
                        "supervisor_note": None,
                        "case_size": _case_size(product),
                    }
                )

        stops_payload.append(
            {
                "stop_id": stop.id,
                "sales_final_invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number or "-",
                "customer_id": invoice.customer_id,
                "customer_name": customer.customer_name if customer else "Unknown Customer",
                "total_amount": Decimal(invoice.final_amount or 0),
                "total_weight_grams": weight_map.get(invoice.id, Decimal("0")),
                "status": stop.status,
                "sequence_no": stop.sequence_no or stop.stop_sequence,
                "loading_sequence_no": stop.loading_sequence_no or stop.reverse_load_sequence,
                "distance_meters": stop.distance_meters,
                "duration_seconds": stop.duration_seconds,
                "e_invoice_number": invoice.e_invoice_number,
                "gst_invoice_number": invoice.gst_invoice_number,
                "eway_bill_number": invoice.eway_bill_number,
                "customer_latitude": stop.customer_latitude,
                "customer_longitude": stop.customer_longitude,
                "total_boxes_or_bags": packing_output.total_boxes_or_bags if packing_output else None,
                "loose_cases": packing_output.loose_cases if packing_output else None,
                "full_cases": packing_output.full_cases if packing_output else None,
                "packing_note": packing_output.packing_note if packing_output else None,
                "items": items_payload,
            }
        )

    return {
        "run_id": run.id,
        "warehouse_id": run.warehouse_id,
        "warehouse_name": warehouse.name if warehouse else "Unknown Warehouse",
        "delivery_date": run.run_date,
        "vehicle_id": run.vehicle_id,
        "vehicle_name": vehicle.vehicle_name if vehicle else None,
        "registration_no": vehicle.registration_no if vehicle else None,
        "capacity_kg": vehicle.capacity_kg if vehicle else None,
        "driver_id": run.driver_id,
        "driver_name": employees.get(run.driver_id).full_name if employees.get(run.driver_id) else None,
        "in_vehicle_employee_id": run.in_vehicle_employee_id,
        "in_vehicle_employee_name": employees.get(run.in_vehicle_employee_id).full_name if employees.get(run.in_vehicle_employee_id) else None,
        "bill_manager_id": run.bill_manager_id,
        "bill_manager_name": employees.get(run.bill_manager_id).full_name if employees.get(run.bill_manager_id) else None,
        "loader_id": run.loader_id,
        "loader_name": employees.get(run.loader_id).full_name if employees.get(run.loader_id) else None,
        "status": run.status,
        "total_weight_grams": Decimal(run.total_weight_grams or 0),
        "optimized": bool(run.optimized),
        "route_provider": run.route_provider or run.route_engine,
        "google_maps_url": route_payload.get("google_maps_url") if isinstance(route_payload.get("google_maps_url"), str) else None,
        "total_duration_seconds": int(route_payload.get("total_duration_seconds")) if route_payload.get("total_duration_seconds") is not None else None,
        "route_generated_at": run.route_generated_at.isoformat() if run.route_generated_at else None,
        "loading_completed_at": run.loading_completed_at.isoformat() if run.loading_completed_at else None,
        "delivery_started_at": run.delivery_started_at.isoformat() if run.delivery_started_at else None,
        "created_at": run.created_at.isoformat(),
        "source_batch_ids": source_batch_ids,
        "stops": stops_payload,
    }


async def _eligible_ready_invoices(session: AsyncSession, invoice_ids: list[uuid.UUID]) -> tuple[uuid.UUID, list[SalesFinalInvoice]]:
    rows = (
        await session.execute(
            select(SalesFinalInvoice)
            .where(SalesFinalInvoice.id.in_(invoice_ids), SalesFinalInvoice.deleted_at.is_(None))
            .order_by(SalesFinalInvoice.created_at.asc())
        )
    ).scalars().all()
    if len(rows) != len(set(invoice_ids)):
        raise ValueError("One or more final invoices were not found")
    warehouse_ids = {row.warehouse_id for row in rows}
    if len(warehouse_ids) != 1:
        raise ValueError("All selected invoices must belong to the same warehouse")
    for invoice in rows:
        if _normalize_status(invoice.delivery_status) != InvoiceWorkflowStatus.READY_TO_DISPATCH.value:
            raise ValueError(f"Invoice {invoice.invoice_number or invoice.id} is not ready to dispatch")
    open_stop_rows = (
        await session.execute(
            select(DeliveryRunStop.sales_final_invoice_id)
            .join(DeliveryRun, DeliveryRun.id == DeliveryRunStop.delivery_run_id)
            .where(
                DeliveryRunStop.sales_final_invoice_id.in_(invoice_ids),
                DeliveryRun.status.in_(ACTIVE_DELIVERY_RUN_STATUSES),
            )
        )
    ).all()
    if open_stop_rows:
        raise ValueError("One or more selected invoices are already allocated to an active delivery run")
    return next(iter(warehouse_ids)), rows


async def _planned_vehicle_assignment(
    session: AsyncSession,
    *,
    warehouse_id: uuid.UUID,
    delivery_date: date,
    vehicle_id: uuid.UUID,
) -> DeliveryDailyAssignment:
    stmt = (
        select(DeliveryDailyAssignment)
        .where(
            DeliveryDailyAssignment.warehouse_id == warehouse_id,
            DeliveryDailyAssignment.duty_date == delivery_date,
            DeliveryDailyAssignment.vehicle_id == vehicle_id,
        )
        .order_by(DeliveryDailyAssignment.created_at.asc())
        .limit(1)
    )
    assignment = (await session.execute(stmt)).scalar_one_or_none()
    if assignment is None:
        raise ValueError("No planned delivery assignment exists for this warehouse, vehicle, and date")
    missing = []
    if assignment.driver_id is None:
        missing.append("driver")
    if assignment.helper_id is None:
        missing.append("in-vehicle employee")
    if assignment.bill_manager_id is None:
        missing.append("bill manager")
    if assignment.loader_id is None:
        missing.append("loader")
    if missing:
        raise ValueError(f"Planner assignment is incomplete: missing {', '.join(missing)}")
    return assignment


async def _route_stops_for_invoices(
    session: AsyncSession,
    *,
    warehouse: Warehouse,
    invoices: list[SalesFinalInvoice],
) -> tuple[list[dict[str, object]], dict[str, object]]:
    if warehouse.latitude is None or warehouse.longitude is None:
        raise ValueError(f"Warehouse {warehouse.name} must have latitude and longitude before vehicle allocation")

    stop_seed: list[dict[str, object]] = []
    missing_customers: list[str] = []
    for invoice in invoices:
        customer = await session.get(Customer, invoice.customer_id)
        if customer is None:
            raise ValueError(f"Customer for invoice {invoice.invoice_number or invoice.id} not found")
        if customer.latitude is None or customer.longitude is None:
            missing_customers.append(customer.customer_name)
            continue
        stop_seed.append(
            {
                "sales_final_invoice_id": invoice.id,
                "customer_id": customer.id,
                "customer_name": customer.customer_name,
                "customer_latitude": customer.latitude,
                "customer_longitude": customer.longitude,
            }
        )
    if missing_customers:
        names = ", ".join(sorted(set(missing_customers)))
        raise ValueError(f"Customer outlet coordinates are missing for: {names}")

    payload = None
    try:
        payload = await _build_google_maps_route(
            warehouse_lat=warehouse.latitude,
            warehouse_lng=warehouse.longitude,
            stops=stop_seed,
        )
    except (httpx.HTTPError, ValueError):
        payload = None
    if payload is None:
        payload = _build_fallback_route(
            warehouse_lat=warehouse.latitude,
            warehouse_lng=warehouse.longitude,
            stops=stop_seed,
        )
    return payload["stops"], payload


async def allocate_delivery_run(
    session: AsyncSession,
    *,
    invoice_ids: list[uuid.UUID],
    delivery_date: date,
    vehicle_id: uuid.UUID,
    created_by_user_id: uuid.UUID | None,
) -> dict[str, object]:
    warehouse_id, invoices = await _eligible_ready_invoices(session, invoice_ids)
    warehouse = await session.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise ValueError("Warehouse not found")

    assignment = await _planned_vehicle_assignment(
        session,
        warehouse_id=warehouse_id,
        delivery_date=delivery_date,
        vehicle_id=vehicle_id,
    )
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise ValueError("Vehicle not found")

    invoice_weight_map = await _load_invoice_weights(session, [invoice.id for invoice in invoices])
    total_weight_grams = Decimal("0")
    invoice_weights_payload: list[dict[str, object]] = []
    for invoice in invoices:
        weight = Decimal(invoice_weight_map.get(invoice.id, Decimal("0")))
        total_weight_grams += weight
        invoice_weights_payload.append(
            {
                "sales_final_invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number or "-",
                "weight_grams": weight,
                "weight_kg": (weight / Decimal("1000")).quantize(Decimal("0.001")),
            }
        )
    capacity_kg = Decimal(vehicle.capacity_kg or 0)
    total_weight_kg = total_weight_grams / Decimal("1000")
    if capacity_kg > 0 and total_weight_kg > capacity_kg:
        raise ValueError(
            f"Selected invoices weigh {total_weight_kg.quantize(Decimal('0.001'))}kg, "
            f"which exceeds vehicle capacity {capacity_kg}kg"
        )

    ordered_stops, route_payload = await _route_stops_for_invoices(session, warehouse=warehouse, invoices=invoices)

    run = DeliveryRun(
        warehouse_id=warehouse_id,
        run_date=delivery_date,
        vehicle_id=vehicle_id,
        driver_id=assignment.driver_id,
        in_vehicle_employee_id=assignment.helper_id,
        bill_manager_id=assignment.bill_manager_id,
        loader_id=assignment.loader_id,
        created_by_user_id=created_by_user_id,
        status=InvoiceWorkflowStatus.VEHICLE_ALLOCATED.value,
        total_weight_grams=total_weight_grams,
        optimized=True,
        route_engine=route_payload["provider"],
        optimized_route_payload=json.dumps(route_payload, default=str),
        route_provider=route_payload["provider"],
        route_generated_at=_utcnow(),
    )
    session.add(run)
    await session.flush()

    delivery_assignment = DeliveryAssignment(
        delivery_run_id=run.id,
        driver_id=assignment.driver_id,
        helper_id=assignment.helper_id,
        bill_manager_id=assignment.bill_manager_id,
        loader_id=assignment.loader_id,
    )
    session.add(delivery_assignment)

    invoice_map = {invoice.id: invoice for invoice in invoices}
    batch_ids: set[uuid.UUID] = set()
    for sequence, stop_seed in enumerate(ordered_stops, start=1):
        invoice = invoice_map[stop_seed["sales_final_invoice_id"]]
        stop = DeliveryRunStop(
            delivery_run_id=run.id,
            sales_order_id=invoice.sales_order_id,
            sales_final_invoice_id=invoice.id,
            stop_sequence=sequence,
            reverse_load_sequence=(len(ordered_stops) - sequence + 1),
            sequence_no=sequence,
            loading_sequence_no=(len(ordered_stops) - sequence + 1),
            distance_meters=stop_seed["distance_meters"],
            duration_seconds=stop_seed["duration_seconds"],
            status=InvoiceWorkflowStatus.VEHICLE_ALLOCATED.value,
            customer_latitude=stop_seed["customer_latitude"],
            customer_longitude=stop_seed["customer_longitude"],
        )
        session.add(stop)
        invoice.delivery_status = InvoiceWorkflowStatus.VEHICLE_ALLOCATED.value

        batch_row = (
            await session.execute(
                select(InvoiceAssignmentBatchInvoice).where(
                    InvoiceAssignmentBatchInvoice.sales_final_invoice_id == invoice.id
                )
            )
        ).scalar_one_or_none()
        if batch_row is not None:
            batch_ids.add(batch_row.batch_id)

    for batch_id in sorted(batch_ids):
        session.add(DeliveryRunSourceBatch(delivery_run_id=run.id, invoice_assignment_batch_id=batch_id))

    crew_employee_ids = [
        assignment.driver_id,
        assignment.helper_id,
        assignment.bill_manager_id,
        assignment.loader_id,
    ]
    users = (
        await session.execute(
            select(User).where(User.employee_id.in_(crew_employee_ids), User.is_active.is_(True))
        )
    ).scalars().all()
    for user in users:
        await _create_notification(
            session,
            user_id=user.id,
            notification_type=NotificationType.DELIVERY_CREW_ASSIGNED.value,
            title="Vehicle run assigned",
            message=f"Run {run.id} has been allocated for {delivery_date.isoformat()} in {warehouse.name}.",
            entity_type="delivery_run",
            entity_id=run.id,
        )
    await session.commit()
    response = await _load_delivery_run_response(session, run.id, include_items=False)
    response["invoice_weights"] = invoice_weights_payload
    response["total_weight_kg"] = total_weight_kg.quantize(Decimal("0.001"))
    return response


async def list_delivery_runs(
    session: AsyncSession,
    *,
    warehouse_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    delivery_date: date | None = None,
) -> list[dict[str, object]]:
    stmt = select(DeliveryRun)
    if warehouse_id is not None:
        stmt = stmt.where(DeliveryRun.warehouse_id == warehouse_id)
    if status_filter:
        stmt = stmt.where(func.upper(DeliveryRun.status) == _normalize_status(status_filter))
    if delivery_date is not None:
        stmt = stmt.where(DeliveryRun.run_date == delivery_date)
    stmt = stmt.order_by(DeliveryRun.run_date.desc(), DeliveryRun.created_at.desc())
    runs = (await session.execute(stmt)).scalars().all()
    return [await _load_delivery_run_response(session, run.id, include_items=False) for run in runs]


async def get_delivery_run_detail(session: AsyncSession, run_id: uuid.UUID) -> dict[str, object]:
    return await _load_delivery_run_response(session, run_id, include_items=True)


async def update_invoice_documents(
    session: AsyncSession,
    *,
    invoice_id: uuid.UUID,
    e_invoice_number: str | None,
    gst_invoice_number: str | None,
    eway_bill_number: str | None,
) -> dict[str, object]:
    invoice = await session.get(SalesFinalInvoice, invoice_id)
    if invoice is None:
        raise ValueError("Final invoice not found")
    invoice.e_invoice_number = (e_invoice_number or "").strip() or None
    invoice.gst_invoice_number = (gst_invoice_number or "").strip() or None
    invoice.eway_bill_number = (eway_bill_number or "").strip() or None
    await session.commit()
    return {
        "sales_final_invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "e_invoice_number": invoice.e_invoice_number,
        "gst_invoice_number": invoice.gst_invoice_number,
        "eway_bill_number": invoice.eway_bill_number,
    }


async def mark_run_stop_loaded(session: AsyncSession, *, stop_id: uuid.UUID, employee_id: uuid.UUID) -> dict[str, object]:
    stop = await session.get(DeliveryRunStop, stop_id)
    if stop is None:
        raise ValueError("Delivery run stop not found")
    run = await session.get(DeliveryRun, stop.delivery_run_id)
    if run is None:
        raise ValueError("Delivery run not found")
    if employee_id != run.loader_id and employee_id != run.bill_manager_id and employee_id != run.driver_id and employee_id != run.in_vehicle_employee_id:
        supervisor = await session.get(Employee, employee_id)
        if supervisor is None or supervisor.role != EmployeeRole.SUPERVISOR or supervisor.warehouse_id != run.warehouse_id:
            raise ValueError("Only the assigned crew or warehouse supervisor can mark a stop as loaded")
    stop.status = InvoiceWorkflowStatus.LOADED.value
    stop.loaded_at = _utcnow()
    invoice = await session.get(SalesFinalInvoice, stop.sales_final_invoice_id) if stop.sales_final_invoice_id else None
    if invoice is not None:
        invoice.delivery_status = InvoiceWorkflowStatus.LOADED.value

    all_stops = (
        await session.execute(select(DeliveryRunStop).where(DeliveryRunStop.delivery_run_id == run.id))
    ).scalars().all()
    if all(row.status == InvoiceWorkflowStatus.LOADED.value for row in all_stops):
        run.loading_completed_at = _utcnow()
        invoices = [await session.get(SalesFinalInvoice, row.sales_final_invoice_id) for row in all_stops if row.sales_final_invoice_id]
        docs_ready = all(invoice is not None and _documents_ready(invoice) for invoice in invoices)
        run.status = "READY_TO_START" if docs_ready else "LOADED_WAITING_DOCS"
        users = (
            await session.execute(
                select(User).where(User.employee_id.in_([run.driver_id]), User.is_active.is_(True))
            )
        ).scalars().all()
        for user in users:
            await _create_notification(
                session,
                user_id=user.id,
                notification_type=NotificationType.RUN_READY_TO_START.value,
                title="Run loading completed",
                message=f"Run {run.id} is {'ready to start' if docs_ready else 'waiting for invoice documents'}.",
                entity_type="delivery_run",
                entity_id=run.id,
            )
    else:
        run.status = "LOADING_IN_PROGRESS"
    await session.commit()
    return await _load_delivery_run_response(session, run.id, include_items=True)


async def _runs_for_employee(
    session: AsyncSession,
    *,
    employee_id: uuid.UUID,
    employee_field: str,
) -> list[dict[str, object]]:
    column = getattr(DeliveryRun, employee_field)
    stmt = (
        select(DeliveryRun)
        .where(column == employee_id, DeliveryRun.status.in_(ACTIVE_DELIVERY_RUN_STATUSES | {"COMPLETED", "PARTIALLY_COMPLETED"}))
        .order_by(DeliveryRun.run_date.desc(), DeliveryRun.created_at.desc())
    )
    runs = (await session.execute(stmt)).scalars().all()
    return [await _load_delivery_run_response(session, run.id, include_items=True) for run in runs]


async def current_runs_for_supervisor(session: AsyncSession, *, employee_id: uuid.UUID) -> list[dict[str, object]]:
    employee = await session.get(Employee, employee_id)
    if employee is None:
        raise ValueError("Employee not found")
    stmt = (
        select(DeliveryRun)
        .where(DeliveryRun.warehouse_id == employee.warehouse_id, DeliveryRun.status.in_(ACTIVE_DELIVERY_RUN_STATUSES))
        .order_by(DeliveryRun.run_date.desc(), DeliveryRun.created_at.desc())
    )
    runs = (await session.execute(stmt)).scalars().all()
    return [await _load_delivery_run_response(session, run.id, include_items=True) for run in runs]


async def current_runs_for_driver(session: AsyncSession, *, employee_id: uuid.UUID) -> list[dict[str, object]]:
    return await _runs_for_employee(session, employee_id=employee_id, employee_field="driver_id")


async def current_runs_for_bill_manager(session: AsyncSession, *, employee_id: uuid.UUID) -> list[dict[str, object]]:
    return await _runs_for_employee(session, employee_id=employee_id, employee_field="bill_manager_id")


async def current_runs_for_delivery_helper(session: AsyncSession, *, employee_id: uuid.UUID) -> list[dict[str, object]]:
    helper_runs = await _runs_for_employee(session, employee_id=employee_id, employee_field="in_vehicle_employee_id")
    loader_runs = await _runs_for_employee(session, employee_id=employee_id, employee_field="loader_id")
    merged: dict[uuid.UUID, dict[str, object]] = {}
    for run in helper_runs + loader_runs:
        merged[run["run_id"]] = run
    for run in merged.values():
        for stop in run.get("stops", []):
            stop["items"] = None
    return list(merged.values())


async def start_delivery_run(session: AsyncSession, *, run_id: uuid.UUID, employee_id: uuid.UUID) -> dict[str, object]:
    run = await session.get(DeliveryRun, run_id)
    if run is None:
        raise ValueError("Delivery run not found")
    if run.driver_id != employee_id:
        raise ValueError("Only the assigned driver can start this run")
    stops = (
        await session.execute(select(DeliveryRunStop).where(DeliveryRunStop.delivery_run_id == run.id))
    ).scalars().all()
    if not stops or any(stop.status != InvoiceWorkflowStatus.LOADED.value for stop in stops):
        raise ValueError("All run stops must be loaded before delivery can start")
    invoices = [await session.get(SalesFinalInvoice, stop.sales_final_invoice_id) for stop in stops if stop.sales_final_invoice_id]
    if any(invoice is None or not _documents_ready(invoice) for invoice in invoices):
        raise ValueError("All invoices require e-invoice, GST invoice, and e-way bill numbers before delivery can start")

    run.status = InvoiceWorkflowStatus.DELIVERY_STARTED.value
    run.delivery_started_at = _utcnow()
    for stop in stops:
        stop.status = "OUT_FOR_DELIVERY"
        invoice = await session.get(SalesFinalInvoice, stop.sales_final_invoice_id) if stop.sales_final_invoice_id else None
        if invoice is not None:
            invoice.delivery_status = InvoiceWorkflowStatus.DELIVERY_STARTED.value
    await session.commit()
    return await _load_delivery_run_response(session, run.id, include_items=True)


async def deliver_run_stop(session: AsyncSession, *, stop_id: uuid.UUID, employee_id: uuid.UUID, note: str | None) -> dict[str, object]:
    stop = await session.get(DeliveryRunStop, stop_id)
    if stop is None:
        raise ValueError("Delivery run stop not found")
    run = await session.get(DeliveryRun, stop.delivery_run_id)
    if run is None:
        raise ValueError("Delivery run not found")
    if run.bill_manager_id != employee_id:
        raise ValueError("Only the assigned bill manager can complete delivery")
    stop.status = InvoiceWorkflowStatus.DELIVERY_SUCCESSFUL.value
    stop.delivered_at = _utcnow()
    invoice = await session.get(SalesFinalInvoice, stop.sales_final_invoice_id) if stop.sales_final_invoice_id else None
    if invoice is not None:
        invoice.delivery_status = InvoiceWorkflowStatus.DELIVERY_SUCCESSFUL.value
    session.add(
        PodEvent(
            delivery_run_stop_id=stop.id,
            status=InvoiceWorkflowStatus.DELIVERY_SUCCESSFUL.value,
            note=note,
        )
    )

    run_stops = (
        await session.execute(select(DeliveryRunStop).where(DeliveryRunStop.delivery_run_id == run.id))
    ).scalars().all()
    if all(item.status == InvoiceWorkflowStatus.DELIVERY_SUCCESSFUL.value for item in run_stops):
        run.status = "COMPLETED"
        admin_users = (
            await session.execute(select(User).where(User.account_type == AccountType.SYSTEM, User.is_active.is_(True)))
        ).scalars().all()
        for user in admin_users:
            await _create_notification(
                session,
                user_id=user.id,
                notification_type=NotificationType.DELIVERY_COMPLETED.value,
                title="Delivery run completed",
                message=f"Run {run.id} has been delivered successfully.",
                entity_type="delivery_run",
                entity_id=run.id,
            )
    await session.commit()
    return await _load_delivery_run_response(session, run.id, include_items=True)


async def not_deliver_run_stop(session: AsyncSession, *, stop_id: uuid.UUID, employee_id: uuid.UUID, failure_reason: str | None) -> dict[str, object]:
    stop = await session.get(DeliveryRunStop, stop_id)
    if stop is None:
        raise ValueError("Delivery run stop not found")
    run = await session.get(DeliveryRun, stop.delivery_run_id)
    if run is None:
        raise ValueError("Delivery run not found")
    if run.bill_manager_id != employee_id:
        raise ValueError("Only the assigned bill manager can mark an outlet as not delivered")
    reason = (failure_reason or "").strip()
    if not reason:
        raise ValueError("Failure reason is required")
    stop.status = "NOT_DELIVERED"
    stop.failed_at = _utcnow()
    stop.failure_reason = reason
    invoice = await session.get(SalesFinalInvoice, stop.sales_final_invoice_id) if stop.sales_final_invoice_id else None
    if invoice is not None:
        invoice.delivery_status = InvoiceWorkflowStatus.READY_TO_DISPATCH.value
    session.add(
        PodEvent(
            delivery_run_stop_id=stop.id,
            status="NOT_DELIVERED",
            note=reason,
        )
    )
    admin_users = (
        await session.execute(select(User).where(User.account_type == AccountType.SYSTEM, User.is_active.is_(True)))
    ).scalars().all()
    for user in admin_users:
        await _create_notification(
            session,
            user_id=user.id,
            notification_type=NotificationType.DELIVERY_FAILED_RETURNED.value,
            title="Invoice returned to dispatch queue",
            message=f"Invoice {invoice.invoice_number if invoice else stop.sales_final_invoice_id} could not be delivered and is back in ready-to-dispatch.",
            entity_type="delivery_run_stop",
            entity_id=stop.id,
        )

    run_stops = (
        await session.execute(select(DeliveryRunStop).where(DeliveryRunStop.delivery_run_id == run.id))
    ).scalars().all()
    if all(item.status in {InvoiceWorkflowStatus.DELIVERY_SUCCESSFUL.value, "NOT_DELIVERED"} for item in run_stops):
        if any(item.status == "NOT_DELIVERED" for item in run_stops):
            run.status = "PARTIALLY_COMPLETED"
        else:
            run.status = "COMPLETED"
    await session.commit()
    return await _load_delivery_run_response(session, run.id, include_items=True)
