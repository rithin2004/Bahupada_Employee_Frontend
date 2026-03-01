import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class CustomerProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    outlet_name: str | None
    whatsapp_number: str | None
    alternate_number: str | None
    pan_number: str | None
    pan_doc: str | None
    gst_number: str | None
    gst_doc: str | None
    email: str | None
    route_id: uuid.UUID | None
    customer_type: str
    customer_class: str
    credit_limit: Decimal
    current_balance: Decimal


class CustomerOrderHistoryItem(BaseModel):
    sales_order_id: uuid.UUID
    order_date: date | None
    source: str
    status: str
    total: Decimal


class CustomerPaymentHistoryItem(BaseModel):
    payment_id: uuid.UUID
    payment_date: date | None
    mode: str
    amount: Decimal


class CustomerOrderLineItem(BaseModel):
    sales_order_item_id: uuid.UUID
    sku: str
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
