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


class SalesDirectBillItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal


class SalesDirectBillCreate(BaseModel):
    customer_id: uuid.UUID
    warehouse_id: uuid.UUID
    invoice_number: str | None = None
    invoice_date: date
    items: list[SalesDirectBillItemIn]


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
    discount_percent: Decimal | None = None
    is_free_item: bool = False


class SalesEntryBootstrap(BaseModel):
    today: date
    next_entry_number: str
    default_warehouse_id: uuid.UUID | None = None
    warehouses: list[dict]


class RecentSalesBill(BaseModel):
    bill_number: str
    bill_date: date
    quantity: Decimal
    unit_name: str | None = None
    mrp: Decimal
    rate_value: Decimal
    discount_percent: Decimal
    line_total_amount: Decimal


class SalesEntryProductSummary(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    brand: str | None = None
    description: str | None = None
    hsn_code: str | None = None
    tax_percent: Decimal
    mrp: Decimal
    selling_price: Decimal
    unit_1st_name: str | None = None
    unit_2nd_name: str | None = None
    unit_3rd_name: str | None = None
    unit_1st_id: uuid.UUID | None = None
    unit_2nd_id: uuid.UUID | None = None
    unit_3rd_id: uuid.UUID | None = None
    conv_2_to_1: Decimal | None = None
    conv_3_to_2: Decimal | None = None
    conv_3_to_1: Decimal | None = None
    stock_base_quantity: Decimal
    stock_ratio: str
    latest_rate_value: Decimal | None = None
    latest_rate_unit_level: int | None = None
    latest_discount_percent: Decimal | None = None
    has_interactions: bool = False
    recent_bills: list[RecentSalesBill] = []


class CustomerPendingSalesOrderSummary(BaseModel):
    sales_order_id: uuid.UUID
    invoice_number: str | None = None
    warehouse_id: uuid.UUID
    warehouse_name: str
    source: str
    source_label: str | None = None
    status: str
    created_at: str
    items: list[CustomerPendingSalesOrderItem]


class SalesEntryPendingCustomer(BaseModel):
    sales_order_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    warehouse_id: uuid.UUID
    invoice_number: str | None = None
    source: str
    source_label: str | None = None
    status: str
    created_at: str


class SalesEntryRecentInvoice(BaseModel):
    invoice_number: str
    invoice_date: date
    total_amount: Decimal


class SalesEntryRecentReceipt(BaseModel):
    payment_date: date
    amount: Decimal
    mode: str | None = None


class SalesEntryCustomerSummary(BaseModel):
    customer_id: uuid.UUID
    customer_name: str
    address_lines: list[str]
    gstin: str | None = None
    phone: str | None = None
    route_name: str | None = None
    annual_sales_amount: Decimal
    monthly_sales_amount: Decimal
    balance: Decimal
    balance_side: str
    last_sale_date: date | None = None
    last_receipt_date: date | None = None
    recent_invoices: list[SalesEntryRecentInvoice]
    recent_receipts: list[SalesEntryRecentReceipt]
