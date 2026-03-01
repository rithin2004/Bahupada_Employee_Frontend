import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PurchaseChallanItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal
    expiry_date: date | None = None


class PurchaseChallanCreate(BaseModel):
    warehouse_id: uuid.UUID
    vendor_id: uuid.UUID
    rack_id: uuid.UUID | None = None
    reference_no: str
    items: list[PurchaseChallanItemIn]


class PurchaseBillItemIn(BaseModel):
    product_id: uuid.UUID
    batch_no: str
    expiry_date: date | None = None
    quantity: Decimal
    damaged_quantity: Decimal = Decimal("0")
    unit_price: Decimal


class PurchaseBillCreate(BaseModel):
    challan_id: uuid.UUID
    bill_number: str
    bill_date: date
    items: list[PurchaseBillItemIn]


class PurchaseReturnItemIn(BaseModel):
    product_id: uuid.UUID
    batch_number: str
    quantity: Decimal
    purchase_price: Decimal | None = None


class PurchaseReturnCreate(BaseModel):
    vendor_id: uuid.UUID
    warehouse_id: uuid.UUID
    return_date: date
    reason: str | None = None
    items: list[PurchaseReturnItemIn]


class PurchaseExpiryItemIn(BaseModel):
    product_id: uuid.UUID
    batch_number: str
    quantity: Decimal


class PurchaseExpiryCreate(BaseModel):
    vendor_id: uuid.UUID
    warehouse_id: uuid.UUID
    expiry_date: date
    reason: str | None = None
    items: list[PurchaseExpiryItemIn]


class WarehouseTransferItemIn(BaseModel):
    product_id: uuid.UUID
    batch_number: str
    quantity: Decimal


class WarehouseTransferCreate(BaseModel):
    from_warehouse_id: uuid.UUID
    to_warehouse_id: uuid.UUID
    items: list[WarehouseTransferItemIn]


class ReorderItemIn(BaseModel):
    product_id: uuid.UUID
    reorder_norm_qty: Decimal | None = None
    stock_qty: Decimal | None = None
    suggested_qty: Decimal | None = None
    override_qty: Decimal | None = None
    final_qty: Decimal | None = None
    vendor_id: uuid.UUID | None = None


class ReorderLogCreate(BaseModel):
    brand: str | None = None
    warehouse_scope: str | None = None
    warehouse_id: uuid.UUID | None = None
    days: int | None = None
    grace_days: int | None = None
    strategy: str | None = None
    created_by: uuid.UUID | None = None
    items: list[ReorderItemIn] = []
