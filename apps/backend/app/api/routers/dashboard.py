from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.auth import AuthUserInfo, require_employee_or_admin_portal
from app.db.session import get_db
from app.models.entities import (
    Customer,
    InventoryBatch,
    PackingTask,
    Product,
    PurchaseBill,
    ReorderItem,
    ReorderLog,
    RouteMaster,
    SalesFinalInvoice,
    SalesOrder,
    SalesOrderItem,
    Vendor,
    Warehouse,
)
from app.schemas.dashboard import (
    DashboardOverviewResponse,
    DashboardStatusPoint,
    DashboardStockAlertItem,
    DashboardSummary,
    DashboardTrendPoint,
    DashboardWarehouseStockPoint,
)
from app.services.finance import ledger_summary

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))


def _today_ist() -> date:
    return datetime.now(IST).date()


def _month_start_ist(today: date) -> date:
    return today.replace(day=1)


def _start_of_window(today: date, days: int) -> date:
    return today - timedelta(days=days - 1)


def _decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


async def _date_amount_map(
    db: AsyncSession,
    *,
    start_date: date,
    end_date: date,
    date_column,
    amount_column,
):
    rows = (
        await db.execute(
            select(
                date_column.label("day"),
                func.coalesce(func.sum(amount_column), Decimal("0")).label("amount"),
            )
            .where(date_column >= start_date, date_column <= end_date)
            .group_by(date_column)
        )
    ).all()
    return {row[0]: _decimal(row[1]) for row in rows}


async def _pending_orders(db: AsyncSession, limit: int = 8) -> list[dict]:
    stmt = (
        select(
            SalesOrder.id,
            SalesOrder.customer_id,
            SalesOrder.warehouse_id,
            SalesOrder.invoice_number,
            Customer.name.label("customer_name"),
            Warehouse.name.label("warehouse_name"),
            RouteMaster.route_name.label("route_name"),
            SalesOrder.source,
            SalesOrder.status,
            SalesOrder.created_at,
            func.coalesce(
                func.sum(SalesOrderItem.quantity * func.coalesce(SalesOrderItem.selling_price, SalesOrderItem.unit_price)),
                Decimal("0"),
            ).label("amount"),
        )
        .select_from(SalesOrder)
        .join(Customer, Customer.id == SalesOrder.customer_id)
        .join(Warehouse, Warehouse.id == SalesOrder.warehouse_id)
        .outerjoin(RouteMaster, RouteMaster.id == SalesOrder.route_id)
        .outerjoin(PackingTask, PackingTask.sales_order_id == SalesOrder.id)
        .outerjoin(SalesOrderItem, SalesOrderItem.sales_order_id == SalesOrder.id)
        .where(
            SalesOrder.deleted_at.is_(None),
            func.upper(SalesOrder.status) == "PENDING",
            PackingTask.id.is_(None),
        )
        .group_by(
            SalesOrder.id,
            SalesOrder.invoice_number,
            Customer.name,
            Warehouse.name,
            RouteMaster.route_name,
            SalesOrder.source,
            SalesOrder.status,
            SalesOrder.created_at,
        )
        .order_by(SalesOrder.created_at.asc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    items = []
    for row in rows:
        # row order mirrors the select statement above
        order_id = row[0]
        customer_id = row[1]
        warehouse_id = row[2]
        invoice_number = row[3]
        customer_name = row[4]
        warehouse_name = row[5]
        route_name = row[6]
        source = row[7]
        status = row[8]
        created_at = row[9]
        amount = _decimal(row[10])
        items.append(
            {
                "sales_order_id": str(order_id),
                "customer_id": str(customer_id),
                "customer_name": customer_name,
                "warehouse_id": str(warehouse_id),
                "source": source.value if hasattr(source, "value") else str(source),
                "status": "Awaiting Packing" if str(status).upper() == "PENDING" else str(status),
                "created_at": created_at.isoformat() if isinstance(created_at, datetime) else str(created_at),
                "invoice_number": invoice_number or f"SO-{str(order_id)[:8].upper()}",
                "route_name": route_name,
                "warehouse_name": warehouse_name,
                "amount": amount,
            }
        )
    return items


async def _packing_breakdown(db: AsyncSession) -> list[DashboardStatusPoint]:
    rows = (
        await db.execute(
            select(func.upper(PackingTask.status), func.count(PackingTask.id)).group_by(func.upper(PackingTask.status))
        )
    ).all()
    ordered = ["PENDING", "ASSIGNED", "IN_PROGRESS", "READY_TO_DISPATCH", "COMPLETED", "CANCELLED"]
    counts = {str(label or "").upper(): int(count or 0) for label, count in rows}
    breakdown = [DashboardStatusPoint(label=label.replace("_", " ").title(), count=counts[label]) for label in ordered if counts.get(label)]
    for label, count in counts.items():
        if label not in ordered:
            breakdown.append(DashboardStatusPoint(label=label.replace("_", " ").title(), count=count))
    return breakdown


async def _warehouse_stock(db: AsyncSession) -> list[DashboardWarehouseStockPoint]:
    rows = (
        await db.execute(
            select(
                Warehouse.name,
                func.coalesce(func.sum(InventoryBatch.available_quantity), Decimal("0")),
                func.count(InventoryBatch.id),
            )
            .select_from(Warehouse)
            .outerjoin(InventoryBatch, InventoryBatch.warehouse_id == Warehouse.id)
            .where(Warehouse.is_active.is_(True))
            .group_by(Warehouse.id, Warehouse.name)
            .order_by(func.coalesce(func.sum(InventoryBatch.available_quantity), Decimal("0")).desc())
        )
    ).all()
    return [
        DashboardWarehouseStockPoint(
            warehouse_name=str(name or "Warehouse"),
            total_stock=_decimal(total_stock),
            batch_count=int(batch_count or 0),
        )
        for name, total_stock, batch_count in rows
    ]


async def _stock_alerts(db: AsyncSession) -> list[DashboardStockAlertItem]:
    latest_log = (
        await db.execute(select(ReorderLog).order_by(ReorderLog.created_at.desc()).limit(1))
    ).scalar_one_or_none()
    if latest_log is not None:
        rows = (
            await db.execute(
                select(
                    Product.id,
                    Product.sku,
                    Product.name,
                    func.coalesce(Warehouse.name, "All Warehouses"),
                    ReorderItem.stock_qty,
                    ReorderItem.reorder_norm_qty,
                    ReorderItem.suggested_qty,
                    ReorderItem.final_qty,
                )
                .select_from(ReorderItem)
                .join(Product, Product.id == ReorderItem.product_id)
                .outerjoin(ReorderLog, ReorderLog.id == ReorderItem.reorder_id)
                .outerjoin(Warehouse, Warehouse.id == ReorderLog.warehouse_id)
                .where(ReorderItem.reorder_id == latest_log.id)
                .order_by(func.coalesce(ReorderItem.stock_qty, Decimal("0")).asc())
                .limit(8)
            )
        ).all()
        return [
            DashboardStockAlertItem(
                product_id=row[0],
                sku=str(row[1]),
                product_name=str(row[2]),
                warehouse_name=str(row[3] or "All Warehouses"),
                available_quantity=_decimal(row[4]),
                reorder_norm_qty=row[5],
                suggested_qty=row[6],
                final_qty=row[7],
            )
            for row in rows
        ]

    rows = (
        await db.execute(
            select(
                Product.id,
                Product.sku,
                Product.name,
                Warehouse.name,
                func.coalesce(func.sum(InventoryBatch.available_quantity), Decimal("0")),
            )
            .select_from(InventoryBatch)
            .join(Product, Product.id == InventoryBatch.product_id)
            .join(Warehouse, Warehouse.id == InventoryBatch.warehouse_id)
            .group_by(Product.id, Product.sku, Product.name, Warehouse.name)
            .order_by(func.coalesce(func.sum(InventoryBatch.available_quantity), Decimal("0")).asc())
            .limit(8)
        )
    ).all()
    return [
        DashboardStockAlertItem(
            product_id=row[0],
            sku=str(row[1]),
            product_name=str(row[2]),
            warehouse_name=str(row[3] or "Warehouse"),
            available_quantity=_decimal(row[4]),
        )
        for row in rows
    ]


@router.get("/overview", response_model=DashboardOverviewResponse, dependencies=[Depends(require_employee_or_admin_portal)])
async def dashboard_overview(
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    today = _today_ist()
    month_start = _month_start_ist(today)
    trend_start = _start_of_window(today, 7)

    sales_today_total = _decimal(
        (
            await db.execute(
                select(func.coalesce(func.sum(SalesFinalInvoice.total_amount), Decimal("0"))).where(
                    SalesFinalInvoice.deleted_at.is_(None),
                    SalesFinalInvoice.invoice_date == today,
                )
            )
        ).scalar_one()
    )
    sales_month_total = _decimal(
        (
            await db.execute(
                select(func.coalesce(func.sum(SalesFinalInvoice.total_amount), Decimal("0"))).where(
                    SalesFinalInvoice.deleted_at.is_(None),
                    SalesFinalInvoice.invoice_date >= month_start,
                    SalesFinalInvoice.invoice_date <= today,
                )
            )
        ).scalar_one()
    )
    purchase_today_total = _decimal(
        (
            await db.execute(
                select(func.coalesce(func.sum(PurchaseBill.total_amount), Decimal("0"))).where(
                    PurchaseBill.deleted_at.is_(None),
                    PurchaseBill.bill_date == today,
                )
            )
        ).scalar_one()
    )

    pending_orders = int(
        (
            await db.execute(
                select(func.count())
                .select_from(SalesOrder)
                .outerjoin(PackingTask, PackingTask.sales_order_id == SalesOrder.id)
                .where(
                    SalesOrder.deleted_at.is_(None),
                    func.upper(SalesOrder.status) == "PENDING",
                    PackingTask.id.is_(None),
                )
            )
        ).scalar_one()
        or 0
    )
    pending_packing = int(
        (
            await db.execute(
                select(func.count(PackingTask.id)).where(
                    func.upper(PackingTask.status).in_(["PENDING", "ASSIGNED", "IN_PROGRESS"])
                )
            )
        ).scalar_one()
        or 0
    )
    ready_to_dispatch = int(
        (
            await db.execute(
                select(func.count(PackingTask.id)).where(func.upper(PackingTask.status) == "READY_TO_DISPATCH")
            )
        ).scalar_one()
        or 0
    )

    active_customers = int(
        (await db.execute(select(func.count()).select_from(Customer).where(Customer.is_active.is_(True)))).scalar_one() or 0
    )
    active_vendors = int(
        (await db.execute(select(func.count()).select_from(Vendor).where(Vendor.is_active.is_(True)))).scalar_one() or 0
    )
    warehouses = int(
        (await db.execute(select(func.count()).select_from(Warehouse).where(Warehouse.is_active.is_(True)))).scalar_one() or 0
    )

    receivables_total = Decimal("0")
    if auth.portal == "ADMIN" or auth.is_super_admin:
        summary_rows = await ledger_summary(db)
        receivables_total = next(
            (
                abs(_decimal(row["net"]))
                for row in summary_rows
                if str(row.get("account_name") or "").lower() == "customer receivable"
            ),
            Decimal("0"),
        )

    sales_map = await _date_amount_map(
        db,
        start_date=trend_start,
        end_date=today,
        date_column=SalesFinalInvoice.invoice_date,
        amount_column=SalesFinalInvoice.total_amount,
    )
    purchase_map = await _date_amount_map(
        db,
        start_date=trend_start,
        end_date=today,
        date_column=PurchaseBill.bill_date,
        amount_column=PurchaseBill.total_amount,
    )
    invoice_count_rows = (
        await db.execute(
            select(
                SalesFinalInvoice.invoice_date.label("day"),
                func.count(SalesFinalInvoice.id).label("invoice_count"),
            )
            .where(
                SalesFinalInvoice.deleted_at.is_(None),
                SalesFinalInvoice.invoice_date >= trend_start,
                SalesFinalInvoice.invoice_date <= today,
            )
            .group_by(SalesFinalInvoice.invoice_date)
        )
    ).all()
    invoice_count_map = {row[0]: int(row[1] or 0) for row in invoice_count_rows}

    stock_alerts = await _stock_alerts(db)

    sales_trend = [
        DashboardTrendPoint(
            day=current_day,
            sales_total=sales_map.get(current_day, Decimal("0")),
            purchase_total=purchase_map.get(current_day, Decimal("0")),
            invoice_count=invoice_count_map.get(current_day, 0),
        )
        for current_day in (trend_start + timedelta(days=offset) for offset in range((today - trend_start).days + 1))
    ]

    return DashboardOverviewResponse(
        generated_at=datetime.now(IST).isoformat(),
        summary=DashboardSummary(
            sales_today_total=sales_today_total,
            sales_month_total=sales_month_total,
            purchase_today_total=purchase_today_total,
            pending_orders=pending_orders,
            pending_packing=pending_packing,
            ready_to_dispatch=ready_to_dispatch,
            low_stock_alerts=len(stock_alerts),
            active_customers=active_customers,
            active_vendors=active_vendors,
            warehouses=warehouses,
            receivables_total=receivables_total,
        ),
        sales_trend=sales_trend,
        packing_status_breakdown=await _packing_breakdown(db),
        warehouse_stock=await _warehouse_stock(db),
        dispatch_queue=await _pending_orders(db),
        stock_alerts=stock_alerts,
    )
