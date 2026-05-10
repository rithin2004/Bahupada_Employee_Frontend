from datetime import date
from decimal import Decimal
import uuid

from pydantic import BaseModel, ConfigDict

class DashboardSummary(BaseModel):
    sales_today_total: Decimal
    sales_month_total: Decimal
    purchase_today_total: Decimal
    pending_orders: int
    pending_packing: int
    ready_to_dispatch: int
    low_stock_alerts: int
    active_customers: int
    active_vendors: int
    warehouses: int
    receivables_total: Decimal = Decimal("0")


class DashboardTrendPoint(BaseModel):
    day: date
    sales_total: Decimal
    purchase_total: Decimal
    invoice_count: int


class DashboardStatusPoint(BaseModel):
    label: str
    count: int


class DashboardWarehouseStockPoint(BaseModel):
    warehouse_name: str
    total_stock: Decimal
    batch_count: int


class DashboardStockAlertItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: uuid.UUID
    sku: str
    product_name: str
    warehouse_name: str
    available_quantity: Decimal
    reorder_norm_qty: Decimal | None = None
    suggested_qty: Decimal | None = None
    final_qty: Decimal | None = None


class DashboardDispatchItem(BaseModel):
    sales_order_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    warehouse_id: uuid.UUID
    warehouse_name: str
    source: str
    status: str
    created_at: str
    invoice_number: str | None = None
    route_name: str | None = None
    amount: Decimal | None = None


class DashboardOverviewResponse(BaseModel):
    generated_at: str
    summary: DashboardSummary
    sales_trend: list[DashboardTrendPoint]
    packing_status_breakdown: list[DashboardStatusPoint]
    warehouse_stock: list[DashboardWarehouseStockPoint]
    dispatch_queue: list[DashboardDispatchItem]
    stock_alerts: list[DashboardStockAlertItem]
