import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import CustomerClass, CustomerType, EmployeeRole, Gender, PartyType, PortalScope


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CompanyCreate(StrictModel):
    company_name: str
    name: str
    organization_name: str | None = None
    gstin: str | None = None
    pan: str | None = None
    cin: str | None = None
    phone: str | None = None
    email: str | None = None
    owner_name: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None


class AreaCreate(StrictModel):
    area_name: str
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class AreaUpdate(BaseModel):
    area_name: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    is_active: bool | None = None


class RouteCreate(StrictModel):
    route_name: str
    area_id: uuid.UUID


class RouteUpdate(BaseModel):
    route_name: str | None = None
    area_id: uuid.UUID | None = None
    is_active: bool | None = None


class WarehouseCreate(StrictModel):
    code: str
    name: str
    street: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class RackCreate(StrictModel):
    warehouse_id: uuid.UUID
    rack_type: str | None = None
    number_of_rows: int = Field(default=1, ge=1)


class RackUpdate(BaseModel):
    warehouse_id: uuid.UUID | None = None
    rack_type: str | None = None
    number_of_rows: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class VehicleCreate(StrictModel):
    registration_no: str
    vehicle_name: str | None = None
    capacity_kg: Decimal | None = None


class VehicleUpdate(BaseModel):
    registration_no: str | None = None
    vehicle_name: str | None = None
    capacity_kg: Decimal | None = None
    is_active: bool | None = None


class EmployeeCreate(StrictModel):
    warehouse_id: uuid.UUID
    full_name: str
    role: EmployeeRole
    phone: str
    username: str | None = None
    password: str | None = None
    role_id: uuid.UUID | None = None
    dob: date | None = None
    gender: Gender | None = None
    alternate_phone: str | None = None
    email: str | None = None
    aadhaar_hash: str | None = None
    pan_number: str | None = None
    driver_license_no: str | None = None
    driver_license_expiry: date | None = None


class ProductCreate(StrictModel):
    sku: str
    name: str
    brand_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    sub_category_id: uuid.UUID | None = None
    description: str | None = None
    hsn_id: uuid.UUID | None = None
    primary_unit_id: uuid.UUID
    secondary_unit_id: uuid.UUID | None = None
    third_unit_id: uuid.UUID | None = None
    secondary_unit_quantity: Decimal | None = None
    third_unit_quantity: Decimal | None = None
    weight_in_grams: Decimal | None = None
    is_bundle: bool = False
    bundle_price_override: Decimal | None = None
    base_price: Decimal
    tax_percent: Decimal


class VendorCreate(StrictModel):
    name: str
    firm_name: str | None = None
    gstin: str | None = None
    pan: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    alternate_phone: str | None = None
    email: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    bank_account_number: str | None = None
    ifsc_code: str | None = None
    account_category_id: uuid.UUID | None = None


class CustomerCreate(StrictModel):
    name: str
    username: str | None = None
    password: str | None = None
    outlet_name: str | None = None
    customer_type: CustomerType | None = None
    customer_category_id: uuid.UUID | None = None
    account_category_id: uuid.UUID | None = None
    customer_class: CustomerClass | None = None
    route_id: uuid.UUID | None = None
    route_name: str | None = None
    pan_number: str | None = None
    pan_doc: str | None = None
    gst_number: str | None = None
    gst_doc: str | None = None
    whatsapp_number: str | None = None
    alternate_number: str | None = None
    gstin: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    email: str | None = None
    credit_limit: Decimal = Decimal("0")
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    is_line_sale_outlet: bool = False


class ProductUpdate(BaseModel):
    sku: str | None = None
    name: str | None = None
    brand_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    sub_category_id: uuid.UUID | None = None
    description: str | None = None
    hsn_id: uuid.UUID | None = None
    primary_unit_id: uuid.UUID | None = None
    secondary_unit_id: uuid.UUID | None = None
    third_unit_id: uuid.UUID | None = None
    secondary_unit_quantity: Decimal | None = None
    third_unit_quantity: Decimal | None = None
    weight_in_grams: Decimal | None = None
    is_bundle: bool | None = None
    bundle_price_override: Decimal | None = None
    base_price: Decimal | None = None
    tax_percent: Decimal | None = None
    is_active: bool | None = None


class UnitCreate(StrictModel):
    unit_code: str
    unit_name: str


class UnitUpdate(BaseModel):
    unit_code: str | None = None
    unit_name: str | None = None


class HSNMasterCreate(StrictModel):
    hsn_code: str
    description: str | None = None
    gst_percent: Decimal = Decimal("0")
    is_active: bool = True


class HSNMasterUpdate(BaseModel):
    hsn_code: str | None = None
    description: str | None = None
    gst_percent: Decimal | None = None
    is_active: bool | None = None


class PricingUpdate(BaseModel):
    mrp: Decimal | None = None
    cost_price: Decimal | None = None
    a_class_price: Decimal | None = None
    b_class_price: Decimal | None = None
    c_class_price: Decimal | None = None
    is_active: bool | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    username: str | None = None
    password: str | None = None
    outlet_name: str | None = None
    customer_type: CustomerType | None = None
    customer_category_id: uuid.UUID | None = None
    account_category_id: uuid.UUID | None = None
    customer_class: CustomerClass | None = None
    route_id: uuid.UUID | None = None
    route_name: str | None = None
    pan_number: str | None = None
    pan_doc: str | None = None
    gst_number: str | None = None
    gst_doc: str | None = None
    whatsapp_number: str | None = None
    alternate_number: str | None = None
    gstin: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    email: str | None = None
    credit_limit: Decimal | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    is_line_sale_outlet: bool | None = None
    is_active: bool | None = None


class WarehouseUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    is_active: bool | None = None


class VendorUpdate(BaseModel):
    name: str | None = None
    firm_name: str | None = None
    gstin: str | None = None
    pan: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    alternate_phone: str | None = None
    email: str | None = None
    street: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    bank_account_number: str | None = None
    ifsc_code: str | None = None
    account_category_id: uuid.UUID | None = None
    is_active: bool | None = None


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    role: EmployeeRole | None = None
    phone: str | None = None
    username: str | None = None
    password: str | None = None
    warehouse_id: uuid.UUID | None = None
    gender: Gender | None = None
    alternate_phone: str | None = None
    email: str | None = None
    is_active: bool | None = None


class CustomerCategoryCreate(StrictModel):
    code: str
    name: str
    customer_type: CustomerType = CustomerType.B2B
    price_class: str = Field(pattern="^[ABC]$")
    is_active: bool = True


class RoleCreate(StrictModel):
    role_name: str
    portal_scope: PortalScope = PortalScope.EMPLOYEE
    description: str | None = None
    is_active: bool = True


class CustomerCategoryUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    customer_type: CustomerType | None = None
    price_class: str | None = Field(default=None, pattern="^[ABC]$")
    is_active: bool | None = None


class AccountCategoryCreate(StrictModel):
    code: str
    name: str
    party_type: PartyType
    description: str | None = None
    is_active: bool = True


class AccountCategoryUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    party_type: PartyType | None = None
    description: str | None = None
    is_active: bool | None = None


class ProductBrandCreate(StrictModel):
    name: str
    is_active: bool = True


class ProductBrandUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class ProductCategoryCreate(StrictModel):
    name: str
    is_active: bool = True


class ProductCategoryUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class ProductSubCategoryCreate(StrictModel):
    name: str
    category_id: uuid.UUID | None = None
    is_active: bool = True


class ProductSubCategoryUpdate(BaseModel):
    name: str | None = None
    category_id: uuid.UUID | None = None
    is_active: bool | None = None
