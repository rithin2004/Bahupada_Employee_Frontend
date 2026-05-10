import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, model_validator


class PurchaseChallanItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal
    quantity_1st: Decimal | None = None
    quantity_2nd: Decimal | None = None
    quantity_3rd: Decimal | None = None
    unit_1st_id: uuid.UUID | None = None
    unit_2nd_id: uuid.UUID | None = None
    unit_3rd_id: uuid.UUID | None = None
    base_quantity: Decimal | None = None
    damaged_quantity: Decimal = Decimal("0")
    unit_price: Decimal | None = None
    purchase_price: Decimal | None = None
    rate_value: Decimal | None = None
    rate_unit_level: int | None = None
    discount_percent: Decimal | None = None
    discount_lumpsum: Decimal | None = None
    discount_mode: str | None = None
    free_buy_quantity: Decimal | None = None
    free_quantity: Decimal | None = None
    effective_unit_cost: Decimal | None = None
    line_subtotal: Decimal | None = None
    line_discount_amount: Decimal | None = None
    line_taxable_amount: Decimal | None = None
    line_tax_amount: Decimal | None = None
    line_total_amount: Decimal | None = None
    expiry_date: date | None = None


class PurchaseChallanCreate(BaseModel):
    warehouse_id: uuid.UUID
    vendor_id: uuid.UUID
    rack_id: uuid.UUID | None = None
    reference_no: str
    entry_number: str | None = None
    items: list[PurchaseChallanItemIn]


class PurchaseBillItemIn(BaseModel):
    product_id: uuid.UUID
    batch_no: str | None = None
    expiry_date: date | None = None
    quantity: Decimal
    qty_primary: Decimal | None = None
    qty_secondary: Decimal | None = None
    qty_third: Decimal | None = None
    damaged_quantity: Decimal = Decimal("0")
    unit_price: Decimal
    quantity_1st: Decimal | None = None
    quantity_2nd: Decimal | None = None
    quantity_3rd: Decimal | None = None
    unit_1st_id: uuid.UUID | None = None
    unit_2nd_id: uuid.UUID | None = None
    unit_3rd_id: uuid.UUID | None = None
    base_quantity: Decimal | None = None
    mrp: Decimal | None = None
    rate_value: Decimal | None = None
    rate_unit_level: int | None = None
    discount_percent: Decimal | None = None
    discount_lumpsum: Decimal | None = None
    discount_mode: str | None = None
    free_buy_quantity: Decimal | None = None
    free_quantity: Decimal | None = None
    effective_unit_cost: Decimal | None = None
    line_subtotal: Decimal | None = None
    line_discount_amount: Decimal | None = None
    line_taxable_amount: Decimal | None = None
    line_tax_amount: Decimal | None = None
    line_total_amount: Decimal | None = None


class PurchaseBillCreate(BaseModel):
    challan_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    warehouse_id: uuid.UUID | None = None
    rack_id: uuid.UUID | None = None
    bill_number: str
    bill_date: date
    received_date: date | None = None
    payment_mode: str | None = None
    tax_type: str | None = None
    freight_amount: Decimal | None = None
    entry_number: str | None = None
    notes: str | None = None
    items: list[PurchaseBillItemIn]

    @model_validator(mode="after")
    def validate_source(self):
        if self.challan_id is not None:
            return self
        if self.vendor_id is None or self.warehouse_id is None:
            raise ValueError("vendor_id and warehouse_id are required when challan_id is not provided")
        return self


class PurchaseBillUpdate(PurchaseBillCreate):
    pass


class PurchaseEntryVendorSummary(BaseModel):
    vendor_id: uuid.UUID
    vendor_name: str
    address_lines: list[str]
    brand_names: list[str] = []
    purchase_type: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    gstin: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    area: str | None = None
    route: str | None = None
    annual_purchase_amount: Decimal
    monthly_purchase_amount: Decimal
    balance: Decimal
    balance_side: str
    last_purchase_date: date | None = None
    last_payment_date: date | None = None
    last_bills: list[dict]
    open_challans: list[dict] = []


class RecentPurchaseBill(BaseModel):
    bill_number: str
    bill_date: date
    quantity: Decimal
    unit_name: str | None = None
    mrp: Decimal
    rate_value: Decimal
    discount_percent: Decimal
    line_total_amount: Decimal


class PurchaseEntryProductSummary(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    brand: str | None = None
    description: str | None = None
    hsn_code: str | None = None
    tax_percent: Decimal
    mrp: Decimal
    cost_price: Decimal
    a_class_price: Decimal = Decimal("0")
    b_class_price: Decimal = Decimal("0")
    c_class_price: Decimal = Decimal("0")
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
    recent_bills: list[RecentPurchaseBill] = []
    category_name: str | None = None
    sub_category_name: str | None = None


class PurchaseEntryBootstrap(BaseModel):
    today: date
    next_entry_number: str
    default_warehouse_id: uuid.UUID | None = None
    warehouses: list[dict]
    company_gstin: str | None = None


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
