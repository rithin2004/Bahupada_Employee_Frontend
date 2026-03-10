import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.models.entities import OrderSource


class SalesOrderItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal


class SalesOrderCreate(BaseModel):
    warehouse_id: uuid.UUID
    customer_id: uuid.UUID
    source: OrderSource
    invoice_number: str | None = None
    items: list[SalesOrderItemIn]


class SalesOrderPreviewItem(BaseModel):
    product_id: uuid.UUID
    sku: str
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    selling_price: Decimal
    discount_percent: Decimal | None = None
    is_free_item: bool = False


class SalesOrderPreviewResponse(BaseModel):
    items: list[SalesOrderPreviewItem]
    subtotal: Decimal
    final_total: Decimal


class SalesOrderPrepareCreate(BaseModel):
    sales_order_id: uuid.UUID
    invoice_number: str | None = None
    allow_negative_override: bool = False
    override_reason: str | None = None


# Deprecated compatibility alias. Use SalesOrderPrepareCreate instead.
class SalesInitialInvoiceCreate(SalesOrderPrepareCreate):
    pass


class SalesFinalInvoiceCreate(BaseModel):
    sales_order_id: uuid.UUID
    invoice_number: str
    invoice_date: date
    subtotal: Decimal
    gst_amount: Decimal
    total_amount: Decimal
    status: str | None = None


class SalesFinalInvoiceItemIn(BaseModel):
    sales_order_item_id: uuid.UUID
    quantity: Decimal


class SalesFinalInvoiceFromOrderCreate(BaseModel):
    sales_order_id: uuid.UUID
    invoice_number: str | None = None
    invoice_date: date
    status: str | None = None
    items: list[SalesFinalInvoiceItemIn]


class SalesFinalInvoiceEditRequest(BaseModel):
    subtotal: Decimal | None = None
    gst_amount: Decimal | None = None
    total_amount: Decimal | None = None
    status: str | None = None
    delivery_status: str | None = None
    reason: str | None = None
    auto_note: bool = True


class SalesReturnItemIn(BaseModel):
    product_id: uuid.UUID
    batch_number: str
    quantity: Decimal


class SalesReturnCreate(BaseModel):
    sales_final_invoice_id: uuid.UUID
    return_date: date
    reason: str | None = None
    items: list[SalesReturnItemIn]


class SalesExpiryItemIn(BaseModel):
    product_id: uuid.UUID
    batch_number: str
    quantity: Decimal


class SalesExpiryCreate(BaseModel):
    customer_id: uuid.UUID
    expiry_date: date
    reason: str | None = None
    items: list[SalesExpiryItemIn]


class PendingOrderDashboardItem(BaseModel):
    sales_order_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    warehouse_id: uuid.UUID
    source: str
    status: str
    created_at: str


class PendingOrdersDashboardResponse(BaseModel):
    count: int
    items: list[PendingOrderDashboardItem]


class CustomerPendingSalesOrderItem(BaseModel):
    sales_order_item_id: uuid.UUID
    product_id: uuid.UUID
    sku: str
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    selling_price: Decimal | None = None


class CustomerPendingSalesOrderSummary(BaseModel):
    sales_order_id: uuid.UUID
    invoice_number: str | None = None
    warehouse_id: uuid.UUID
    warehouse_name: str
    source: str
    status: str
    created_at: str
    items: list[CustomerPendingSalesOrderItem]
