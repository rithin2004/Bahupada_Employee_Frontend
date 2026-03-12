import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class EmployeeRole(str, Enum):
    ADMIN = "ADMIN"
    PACKER = "PACKER"
    SUPERVISOR = "SUPERVISOR"
    SALESMAN = "SALESMAN"
    DELIVERY_EMPLOYEE = "DELIVERY_EMPLOYEE"
    DRIVER = "DRIVER"
    IN_VEHICLE_HELPER = "IN_VEHICLE_HELPER"
    BILL_MANAGER = "BILL_MANAGER"
    LOADER = "LOADER"


class Gender(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"


class StockMoveType(str, Enum):
    IN = "IN"
    OUT = "OUT"
    ADJUST = "ADJUST"
    RETURN = "RETURN"
    EXPIRY = "EXPIRY"
    RESERVE = "RESERVE"
    RELEASE = "RELEASE"


class OrderSource(str, Enum):
    ADMIN = "ADMIN"
    SALESMAN = "SALESMAN"
    CUSTOMER = "CUSTOMER"


class CustomerClass(str, Enum):
    B2B_DISTRIBUTOR = "B2B_DISTRIBUTOR"
    B2B_SEMI_WHOLESALE = "B2B_SEMI_WHOLESALE"
    B2B_TOP_OUTLET = "B2B_TOP_OUTLET"
    B2B_MASS_GROCERY = "B2B_MASS_GROCERY"
    B2C = "B2C"


class CustomerType(str, Enum):
    B2B = "B2B"
    B2C = "B2C"


class VoucherStatus(str, Enum):
    DRAFT = "DRAFT"
    CREATED = "CREATED"
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"


class PortalScope(str, Enum):
    ADMIN = "ADMIN"
    EMPLOYEE = "EMPLOYEE"
    BOTH = "BOTH"


class AccountType(str, Enum):
    EMPLOYEE = "EMPLOYEE"
    SYSTEM = "SYSTEM"
    CUSTOMER = "CUSTOMER"


class PartyType(str, Enum):
    CUSTOMER = "CUSTOMER"
    VENDOR = "VENDOR"


class PartyLedgerEntryKind(str, Enum):
    OPENING_BALANCE = "OPENING_BALANCE"
    PURCHASE_BILL = "PURCHASE_BILL"
    SALES_FINAL_INVOICE = "SALES_FINAL_INVOICE"
    PAYMENT = "PAYMENT"
    CREDIT_NOTE = "CREDIT_NOTE"
    DEBIT_NOTE = "DEBIT_NOTE"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"


class InvoiceWorkflowStatus(str, Enum):
    PACKERS_ASSIGNED = "PACKERS_ASSIGNED"
    VERIFICATION_PENDING = "VERIFICATION_PENDING"
    PACKING_STARTED = "PACKING_STARTED"
    READY_TO_DISPATCH = "READY_TO_DISPATCH"
    VEHICLE_ALLOCATED = "VEHICLE_ALLOCATED"
    LOADED = "LOADED"
    DELIVERY_STARTED = "DELIVERY_STARTED"
    DELIVERY_SUCCESSFUL = "DELIVERY_SUCCESSFUL"
    CANCELLED = "CANCELLED"


class ShortfallReason(str, Enum):
    DAMAGED_PRODUCTS = "DAMAGED_PRODUCTS"
    NO_STOCK_AVAILABLE = "NO_STOCK_AVAILABLE"
    QUALITY_ISSUE = "QUALITY_ISSUE"
    OTHER = "OTHER"


class SupervisorDecision(str, Enum):
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class NotificationType(str, Enum):
    PACKER_ASSIGNMENT = "PACKER_ASSIGNMENT"
    SUPERVISOR_REVIEW = "SUPERVISOR_REVIEW"
    PACKING_START = "PACKING_START"
    ADMIN_READY_TO_DISPATCH = "ADMIN_READY_TO_DISPATCH"
    PACKER_REASSIGNED = "PACKER_REASSIGNED"
    ADMIN_VEHICLE_ALLOCATION_REQUIRED = "ADMIN_VEHICLE_ALLOCATION_REQUIRED"
    DELIVERY_CREW_ASSIGNED = "DELIVERY_CREW_ASSIGNED"
    SUPERVISOR_LOADING_READY = "SUPERVISOR_LOADING_READY"
    RUN_READY_TO_START = "RUN_READY_TO_START"
    DELIVERY_COMPLETED = "DELIVERY_COMPLETED"
    DELIVERY_FAILED_RETURNED = "DELIVERY_FAILED_RETURNED"


class PaymentFlowDirection(str, Enum):
    INCOMING = "INCOMING"
    OUTGOING = "OUTGOING"


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(200), unique=True)
    organization_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alternate_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    signature_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CompanyDocument(Base, TimestampMixin):
    __tablename__ = "company_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id"), nullable=False)
    document_name: Mapped[str] = mapped_column(String(120))
    document_type: Mapped[str] = mapped_column(String(80))
    document_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    alert_before_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AreaMaster(Base, TimestampMixin):
    __tablename__ = "area_master"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    area_name: Mapped[str] = mapped_column(String(120), unique=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RouteMaster(Base, TimestampMixin):
    __tablename__ = "route_master"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_name: Mapped[str] = mapped_column(String(120), unique=True)
    area_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("area_master.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_name: Mapped[str] = mapped_column(String(80), unique=True)
    portal_scope: Mapped[PortalScope] = mapped_column(
        SQLEnum(PortalScope, name="portal_scope"),
        default=PortalScope.EMPLOYEE,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_name: Mapped[str] = mapped_column(String(80), nullable=False)
    action_name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"), nullable=False)
    permission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("permissions.id"), nullable=False)
    can_create: Mapped[bool] = mapped_column(Boolean, default=False)
    can_read: Mapped[bool] = mapped_column(Boolean, default=True)
    can_update: Mapped[bool] = mapped_column(Boolean, default=False)
    can_delete: Mapped[bool] = mapped_column(Boolean, default=False)


class Warehouse(Base, TimestampMixin):
    __tablename__ = "warehouses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Rack(Base, TimestampMixin):
    __tablename__ = "racks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    rack_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    number_of_rows: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RackRow(Base, TimestampMixin):
    __tablename__ = "rack_rows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rack_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("racks.id"), nullable=False)
    capacity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Employee(Base, TimestampMixin):
    __tablename__ = "employees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    role_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("roles.id"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[EmployeeRole] = mapped_column(SQLEnum(EmployeeRole, name="employee_role"))
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[Gender | None] = mapped_column(SQLEnum(Gender, name="gender"), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    aadhaar_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pan_number: Mapped[str | None] = mapped_column(String(16), nullable=True)
    driver_license_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    driver_license_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    driver_license_photo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("phone", name="uq_users_phone"),
        UniqueConstraint("customer_id", name="uq_users_customer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    account_type: Mapped[AccountType] = mapped_column(
        SQLEnum(AccountType, name="account_type"),
        default=AccountType.EMPLOYEE,
        nullable=False,
    )
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    username: Mapped[str | None] = mapped_column(String(80), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    account_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    device_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Unit(Base, TimestampMixin):
    __tablename__ = "units"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_code: Mapped[str] = mapped_column(String(20), unique=True)
    unit_name: Mapped[str] = mapped_column(String(40), unique=True)


class HSNMaster(Base, TimestampMixin):
    __tablename__ = "hsn_master"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hsn_code: Mapped[str] = mapped_column(String(32), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    gst_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProductBrand(Base, TimestampMixin):
    __tablename__ = "product_brands"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProductCategory(Base, TimestampMixin):
    __tablename__ = "product_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProductSubCategory(Base, TimestampMixin):
    __tablename__ = "product_sub_categories"
    __table_args__ = (UniqueConstraint("category_id", "name", name="uq_product_sub_category_category_name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_categories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sub_category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    brand_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_brands.id"), nullable=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_categories.id"), nullable=True)
    sub_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_sub_categories.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    hsn_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hsn_master.id"), nullable=True)
    primary_unit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    secondary_unit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    third_unit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    conv_2_to_1: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    conv_3_to_2: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    conv_3_to_1: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    weight_in_grams: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    unit: Mapped[str] = mapped_column(String(30))
    is_bundle: Mapped[bool] = mapped_column(Boolean, default=False)
    bundle_price_override: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    base_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    tax_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ItemBundleComponent(Base, TimestampMixin):
    __tablename__ = "item_bundle_components"
    __table_args__ = (
        UniqueConstraint("bundle_product_id", "component_product_id", name="uq_bundle_component"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bundle_product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    component_product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)


class Pricing(Base, TimestampMixin):
    __tablename__ = "pricing"
    __table_args__ = (UniqueConstraint("product_id", name="uq_pricing_product"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    mrp: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    cost_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    a_class_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    b_class_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    c_class_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    pct_diff_a_mrp: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    pct_diff_b_mrp: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    pct_diff_c_mrp: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CustomerProductPrice(Base, TimestampMixin):
    __tablename__ = "customer_product_prices"
    __table_args__ = (UniqueConstraint("customer_id", "product_id", name="uq_customer_product_price"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RouteProductPrice(Base, TimestampMixin):
    __tablename__ = "route_product_prices"
    __table_args__ = (UniqueConstraint("route_id", "product_id", name="uq_route_product_price"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("route_master.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CustomerCategory(Base, TimestampMixin):
    __tablename__ = "customer_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    customer_type: Mapped[CustomerType] = mapped_column(
        SQLEnum(CustomerType, name="customer_type"), default=CustomerType.B2B, nullable=False
    )
    # Price class mapping used as default tier for customer pricing.
    price_class: Mapped[str] = mapped_column(String(1), nullable=False, default="A")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AccountCategory(Base, TimestampMixin):
    __tablename__ = "account_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    party_type: Mapped[PartyType] = mapped_column(SQLEnum(PartyType, name="party_type"), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Vendor(Base, TimestampMixin):
    __tablename__ = "vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    firm_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(16), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    bank_account_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ifsc_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    account_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("account_categories.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    outlet_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pan_number: Mapped[str | None] = mapped_column(String(16), nullable=True)
    pan_doc: Mapped[str | None] = mapped_column(String(512), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gst_doc: Mapped[str | None] = mapped_column(String(512), nullable=True)
    whatsapp_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alternate_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    customer_type: Mapped[CustomerType] = mapped_column(
        SQLEnum(CustomerType, name="customer_type"), default=CustomerType.B2B, nullable=False
    )
    customer_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customer_categories.id"), nullable=True)
    account_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("account_categories.id"), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    route_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("route_master.id"), nullable=True)
    route_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    customer_class: Mapped[CustomerClass] = mapped_column(SQLEnum(CustomerClass, name="customer_class"))
    is_line_sale_outlet: Mapped[bool] = mapped_column(Boolean, default=False)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    current_balance: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Vehicle(Base, TimestampMixin):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    registration_no: Mapped[str] = mapped_column(String(50), unique=True)
    vehicle_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    capacity_kg: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class InventoryBatch(Base, TimestampMixin):
    __tablename__ = "inventory_batches"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "product_id", "batch_no", name="uq_inventory_batch"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    rack_row_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rack_rows.id"), nullable=True)
    batch_no: Mapped[str] = mapped_column(String(80), nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    available_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    reserved_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    damaged_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_no: Mapped[str] = mapped_column(String(80), nullable=False)
    move_type: Mapped[StockMoveType] = mapped_column(SQLEnum(StockMoveType, name="stock_move_type"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reference_type: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WarehouseTransfer(Base, TimestampMixin):
    __tablename__ = "warehouse_transfers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    to_warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default=VoucherStatus.DRAFT.value)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WarehouseTransferItem(Base):
    __tablename__ = "warehouse_transfer_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transfer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouse_transfers.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)


class PurchaseChallan(Base, TimestampMixin):
    __tablename__ = "purchase_challans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    rack_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("racks.id"), nullable=True)
    reference_no: Mapped[str] = mapped_column(String(100), unique=True)
    challan_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    challan_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.DRAFT.value)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PurchaseChallanItem(Base):
    __tablename__ = "purchase_challan_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_challan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_challans.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    rack_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("racks.id"), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    gst_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)


class PurchaseBill(Base, TimestampMixin):
    __tablename__ = "purchase_bills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_challan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("purchase_challans.id"), nullable=True)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vendors.id"), nullable=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    rack_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("racks.id"), nullable=True)
    bill_number: Mapped[str] = mapped_column(String(100), unique=True)
    bill_date: Mapped[date] = mapped_column(Date)
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    gst_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.DRAFT.value)
    posted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PurchaseBillItem(Base):
    __tablename__ = "purchase_bill_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_bills.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_no: Mapped[str] = mapped_column(String(80), nullable=False)
    batch_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    damaged_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)


class PurchaseReturn(Base, TimestampMixin):
    __tablename__ = "purchase_returns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    return_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.DRAFT.value)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_return_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_returns.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)


class PurchaseExpiry(Base, TimestampMixin):
    __tablename__ = "purchase_expiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.DRAFT.value)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PurchaseExpiryItem(Base):
    __tablename__ = "purchase_expiry_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_expiry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_expiries.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)


class ReorderLog(Base, TimestampMixin):
    __tablename__ = "reorder_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    warehouse_scope: Mapped[str | None] = mapped_column(String(30), nullable=True)
    warehouse_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grace_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    strategy: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class ReorderItem(Base):
    __tablename__ = "reorder_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reorder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reorder_logs.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    reorder_norm_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    stock_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    suggested_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    override_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    final_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vendors.id"), nullable=True)


class SalesOrder(Base, TimestampMixin):
    __tablename__ = "sales_orders"
    __table_args__ = (
        Index("ix_sales_orders_deleted_at_created_at", "deleted_at", "created_at"),
        Index("ix_sales_orders_customer_id", "customer_id"),
        Index("ix_sales_orders_warehouse_id", "warehouse_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    salesman_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    route_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("route_master.id"), nullable=True)
    challan_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    source: Mapped[OrderSource] = mapped_column(SQLEnum(OrderSource, name="order_source"))
    status: Mapped[str] = mapped_column(String(40), default="pending")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SalesOrderItem(Base):
    __tablename__ = "sales_order_items"
    __table_args__ = (
        Index("ix_sales_order_items_sales_order_id", "sales_order_id"),
        Index("ix_sales_order_items_product_id", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_orders.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    selling_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    gst_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    parent_bundle_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sales_order_items.id"), nullable=True)
    is_bundle_parent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_bundle_child: Mapped[bool] = mapped_column(Boolean, default=False)


class SalesOrderReservation(Base):
    __tablename__ = "sales_order_reservations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_orders.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reserved_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    picked_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)


class SalesFinalInvoice(Base, TimestampMixin):
    __tablename__ = "sales_final_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_orders.id"), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(100), unique=True)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.CREATED.value)
    delivery_status: Mapped[str] = mapped_column(String(40), default="pending")
    e_invoice_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    gst_invoice_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    eway_bill_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SalesFinalInvoiceItem(Base):
    __tablename__ = "sales_final_invoice_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_final_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_final_invoices.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    selling_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    gst_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)


class InvoiceVersion(Base):
    __tablename__ = "invoice_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_final_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_final_invoices.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class InvoiceAssignmentBatch(Base, TimestampMixin):
    __tablename__ = "invoice_assignment_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    batch_code: Mapped[str] = mapped_column(String(120), unique=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default=InvoiceWorkflowStatus.PACKERS_ASSIGNED.value)


class InvoiceAssignmentBatchInvoice(Base, TimestampMixin):
    __tablename__ = "invoice_assignment_batch_invoices"
    __table_args__ = (UniqueConstraint("batch_id", "sales_final_invoice_id", name="uq_batch_invoice"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoice_assignment_batches.id"), nullable=False)
    sales_final_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_final_invoices.id"), nullable=False)
    assigned_packer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    assigned_supervisor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default=InvoiceWorkflowStatus.PACKERS_ASSIGNED.value)
    requested_verification_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    rejection_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    ready_for_dispatch_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InvoiceExecutionItem(Base, TimestampMixin):
    __tablename__ = "invoice_execution_items"
    __table_args__ = (
        UniqueConstraint("batch_invoice_id", "sales_final_invoice_item_id", name="uq_invoice_execution_item"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoice_assignment_batch_invoices.id"), nullable=False)
    sales_final_invoice_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_final_invoice_items.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    original_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    actual_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    shortfall_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    shortfall_reason: Mapped[str | None] = mapped_column(String(60), nullable=True)
    supervisor_decision: Mapped[str | None] = mapped_column(String(40), nullable=True)
    supervisor_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class InvoicePackingOutput(Base, TimestampMixin):
    __tablename__ = "invoice_packing_outputs"
    __table_args__ = (UniqueConstraint("batch_invoice_id", name="uq_invoice_packing_output"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoice_assignment_batch_invoices.id"), nullable=False)
    total_boxes_or_bags: Mapped[int] = mapped_column(Integer, default=0)
    loose_cases: Mapped[int] = mapped_column(Integer, default=0)
    full_cases: Mapped[int] = mapped_column(Integer, default=0)
    packing_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InvoiceShortfallReturn(Base, TimestampMixin):
    __tablename__ = "invoice_shortfall_returns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoice_assignment_batch_invoices.id"), nullable=False)
    sales_final_invoice_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_final_invoice_items.id"), nullable=False)
    returned_sales_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_orders.id"), nullable=False)
    returned_sales_order_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sales_order_items.id"), nullable=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(60), nullable=True)


class SalesReturn(Base, TimestampMixin):
    __tablename__ = "sales_returns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_final_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_final_invoices.id"), nullable=False)
    return_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.DRAFT.value)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SalesReturnItem(Base):
    __tablename__ = "sales_return_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_return_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_returns.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)


class SalesExpiry(Base, TimestampMixin):
    __tablename__ = "sales_expiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.DRAFT.value)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SalesExpiryItem(Base):
    __tablename__ = "sales_expiry_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_expiry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_expiries.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    batch_number: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"
    __table_args__ = (UniqueConstraint("employee_id", "attendance_date", name="uq_attendance_daily"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active_for_shift: Mapped[bool] = mapped_column(Boolean, default=False)


class PackingTask(Base, TimestampMixin):
    __tablename__ = "packing_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_orders.id"), nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    assigned_packer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    assigned_supervisor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending")
    pack_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invoice_written_on_pack: Mapped[bool] = mapped_column(Boolean, default=False)


class DeliveryMonthlyPlan(Base, TimestampMixin):
    __tablename__ = "delivery_monthly_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_name: Mapped[str] = mapped_column(String(200), unique=True)
    month: Mapped[int] = mapped_column(Integer)
    year: Mapped[int] = mapped_column(Integer)


class DeliveryDailyAssignment(Base, TimestampMixin):
    __tablename__ = "delivery_daily_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monthly_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_monthly_plans.id"), nullable=False)
    duty_date: Mapped[date] = mapped_column(Date, nullable=False)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    helper_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    bill_manager_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    loader_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)


class SalesmanMonthlyPlan(Base, TimestampMixin):
    __tablename__ = "salesman_monthly_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_name: Mapped[str] = mapped_column(String(200), unique=True)
    month: Mapped[int] = mapped_column(Integer)
    year: Mapped[int] = mapped_column(Integer)


class SalesmanDailyAssignment(Base, TimestampMixin):
    __tablename__ = "salesman_daily_assignments"
    __table_args__ = (
        UniqueConstraint("monthly_plan_id", "duty_date", "salesman_id", name="uq_salesman_daily_assignment"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monthly_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("salesman_monthly_plans.id"), nullable=False)
    duty_date: Mapped[date] = mapped_column(Date, nullable=False)
    salesman_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    route_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("route_master.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_override: Mapped[bool] = mapped_column(Boolean, default=False)


class DeliveryRun(Base, TimestampMixin):
    __tablename__ = "delivery_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    run_date: Mapped[date] = mapped_column(Date, nullable=False)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    in_vehicle_employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    bill_manager_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    loader_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default=InvoiceWorkflowStatus.VEHICLE_ALLOCATED.value)
    total_weight_grams: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    optimized: Mapped[bool] = mapped_column(Boolean, default=False)
    route_engine: Mapped[str | None] = mapped_column(String(50), nullable=True)
    optimized_route_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    route_provider: Mapped[str | None] = mapped_column(String(60), nullable=True)
    route_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    loading_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DeliveryRunStop(Base):
    __tablename__ = "delivery_run_stops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_runs.id"), nullable=False)
    sales_order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sales_orders.id"), nullable=True)
    sales_final_invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sales_final_invoices.id"), nullable=True)
    stop_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reverse_load_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sequence_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    loading_sequence_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_meters: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default=InvoiceWorkflowStatus.VEHICLE_ALLOCATED.value)
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    customer_longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    eta_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DeliveryAssignment(Base):
    __tablename__ = "delivery_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_runs.id"), nullable=False)
    driver_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    helper_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    bill_manager_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    loader_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)


class DeliveryRunSourceBatch(Base, TimestampMixin):
    __tablename__ = "delivery_run_source_batches"
    __table_args__ = (UniqueConstraint("delivery_run_id", "invoice_assignment_batch_id", name="uq_delivery_run_source_batch"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_runs.id"), nullable=False)
    invoice_assignment_batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoice_assignment_batches.id"), nullable=False)


class PodEvent(Base, TimestampMixin):
    __tablename__ = "pod_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_run_stop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_run_stops.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class SalesmanWeeklyPlanner(Base):
    __tablename__ = "salesman_weekly_planner"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    salesman_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    route_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("route_master.id"), nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)


class DriverVehiclePlanner(Base):
    __tablename__ = "driver_vehicle_planner"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id"), nullable=False)
    duty_date: Mapped[date] = mapped_column(Date, nullable=False)


class SalesmanVisit(Base, TimestampMixin):
    __tablename__ = "salesman_visits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    salesman_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    route_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("route_master.id"), nullable=True)
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="VISITED")
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Salary(Base, TimestampMixin):
    __tablename__ = "salary"
    __table_args__ = (UniqueConstraint("employee_id", "month", "year", name="uq_salary_month"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    basic: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    allowance: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    deductions: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    net_salary: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_status: Mapped[str] = mapped_column(String(20), default="pending")


class Scheme(Base, TimestampMixin):
    __tablename__ = "schemes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scheme_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customer_categories.id"), nullable=False)
    condition_basis: Mapped[str] = mapped_column(String(20), nullable=False)
    threshold_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    threshold_unit: Mapped[str] = mapped_column(String(10), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sub_category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    reward_type: Mapped[str] = mapped_column(String(20), nullable=False)
    reward_discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    reward_product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    reward_product_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SchemeProduct(Base):
    __tablename__ = "scheme_products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    free_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)


class ChartOfAccount(Base, TimestampMixin):
    __tablename__ = "chart_of_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_type: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("chart_of_accounts.id"), nullable=True)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("chart_of_accounts.id"), nullable=True)
    account_name: Mapped[str] = mapped_column(String(200), nullable=False)
    debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    reference_type: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)


class JournalEntry(Base, TimestampMixin):
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=VoucherStatus.POSTED.value)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("journal_entries.id"), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("chart_of_accounts.id"), nullable=True)
    account_name: Mapped[str] = mapped_column(String(200), nullable=False)
    debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_type: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    payment_mode: Mapped[str | None] = mapped_column(String(30), nullable=True)
    mode: Mapped[str] = mapped_column(String(30), nullable=False)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class PaymentAllocation(Base, TimestampMixin):
    __tablename__ = "payment_allocations"
    __table_args__ = (UniqueConstraint("payment_id", "sales_final_invoice_id", name="uq_payment_invoice_allocation"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id"), nullable=False)
    sales_final_invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_final_invoices.id"), nullable=False)
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)


class PartyLedgerAccount(Base, TimestampMixin):
    __tablename__ = "party_ledger_accounts"
    __table_args__ = (UniqueConstraint("party_type", "party_id", name="uq_party_ledger_account_party"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    party_type: Mapped[PartyType] = mapped_column(SQLEnum(PartyType, name="party_type"), nullable=False)
    party_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    party_name_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PartyLedgerEntry(Base, TimestampMixin):
    __tablename__ = "party_ledger_entries"
    __table_args__ = (
        UniqueConstraint(
            "account_id",
            "entry_kind",
            "reference_type",
            "reference_id",
            name="uq_party_ledger_entry_reference",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("party_ledger_accounts.id"), nullable=False)
    entry_kind: Mapped[PartyLedgerEntryKind] = mapped_column(
        SQLEnum(PartyLedgerEntryKind, name="party_ledger_entry_kind"),
        nullable=False,
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    reference_type: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    admin_debit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))
    admin_credit: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))


class PartyLedgerPayment(Base, TimestampMixin):
    __tablename__ = "party_ledger_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("party_ledger_accounts.id"), nullable=False)
    direction: Mapped[PaymentFlowDirection] = mapped_column(
        SQLEnum(PaymentFlowDirection, name="payment_flow_direction"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    payment_mode: Mapped[str | None] = mapped_column(String(30), nullable=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference_no: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class CreditNote(Base, TimestampMixin):
    __tablename__ = "credit_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class DebitNote(Base, TimestampMixin):
    __tablename__ = "debit_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_name: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    old_values: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_values: Mapped[str | None] = mapped_column(Text, nullable=True)
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("key", "endpoint", name="uq_idempotency_key_endpoint"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    response_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


Index("idx_sales_orders_wh_status_created", SalesOrder.warehouse_id, SalesOrder.status, SalesOrder.created_at.desc())
Index("idx_sales_orders_date_status", SalesOrder.challan_date.desc(), SalesOrder.status)
Index("idx_sales_orders_customer", SalesOrder.customer_id, SalesOrder.challan_date.desc())
Index("idx_sales_order_resv_order_product", SalesOrderReservation.sales_order_id, SalesOrderReservation.product_id)
Index("idx_packing_tasks_wh_status_created", PackingTask.warehouse_id, PackingTask.status, PackingTask.created_at.desc())
Index("idx_packing_warehouse_status", PackingTask.warehouse_id, PackingTask.status, PackingTask.created_at.desc())
Index("idx_packing_packer", PackingTask.assigned_packer_id, PackingTask.status)
Index("idx_delivery_daily_assignments_plan_date", DeliveryDailyAssignment.monthly_plan_id, DeliveryDailyAssignment.duty_date)
Index("idx_salesman_daily_assignments_plan_date", SalesmanDailyAssignment.monthly_plan_id, SalesmanDailyAssignment.duty_date)
Index("idx_salesman_daily_assignments_salesman_date", SalesmanDailyAssignment.salesman_id, SalesmanDailyAssignment.duty_date)
Index("idx_salesman_visits_salesman_date", SalesmanVisit.salesman_id, SalesmanVisit.visit_date.desc())
Index("idx_salesman_visits_customer_date", SalesmanVisit.customer_id, SalesmanVisit.visit_date.desc())
Index("idx_delivery_runs_date", DeliveryRun.run_date)
Index("idx_delivery_run_date", DeliveryRun.run_date.desc(), DeliveryRun.warehouse_id)
Index("idx_delivery_stops_sequence", DeliveryRunStop.delivery_run_id, DeliveryRunStop.stop_sequence)
Index(
    "idx_inventory_batch_warehouse_product",
    InventoryBatch.warehouse_id,
    InventoryBatch.product_id,
    InventoryBatch.available_quantity,
)
Index("idx_inventory_batch_expiry", InventoryBatch.expiry_date.asc().nulls_last(), InventoryBatch.available_quantity)
Index("idx_stock_movements_created", StockMovement.created_at.desc())
Index("idx_stock_movements_product", StockMovement.product_id, StockMovement.created_at.desc())
Index("idx_payments_customer_created", Payment.customer_id, Payment.created_at.desc())
Index("idx_payments_customer_date", Payment.customer_id, Payment.payment_date.desc())
Index("idx_payment_allocations_payment", PaymentAllocation.payment_id)
Index("idx_payment_allocations_invoice", PaymentAllocation.sales_final_invoice_id)
Index("idx_sales_final_invoices_delivery_status", SalesFinalInvoice.delivery_status, SalesFinalInvoice.created_at.desc())
Index("idx_invoice_assignment_batches_wh_status", InvoiceAssignmentBatch.warehouse_id, InvoiceAssignmentBatch.status, InvoiceAssignmentBatch.created_at.desc())
Index("idx_invoice_assignment_batch_invoices_status", InvoiceAssignmentBatchInvoice.status, InvoiceAssignmentBatchInvoice.created_at.desc())
Index("idx_invoice_assignment_batch_invoices_packer", InvoiceAssignmentBatchInvoice.assigned_packer_id, InvoiceAssignmentBatchInvoice.status)
Index("idx_invoice_assignment_batch_invoices_supervisor", InvoiceAssignmentBatchInvoice.assigned_supervisor_id, InvoiceAssignmentBatchInvoice.status)
Index("idx_invoice_assignment_batch_invoices_invoice", InvoiceAssignmentBatchInvoice.sales_final_invoice_id)
Index("idx_invoice_execution_items_batch_invoice", InvoiceExecutionItem.batch_invoice_id)
Index("idx_invoice_shortfall_returns_batch_invoice", InvoiceShortfallReturn.batch_invoice_id)
Index("idx_user_notifications_user_unread", UserNotification.user_id, UserNotification.is_read, UserNotification.created_at.desc())
Index("idx_party_ledger_accounts_party", PartyLedgerAccount.party_type, PartyLedgerAccount.party_id)
Index("idx_party_ledger_entries_account_date", PartyLedgerEntry.account_id, PartyLedgerEntry.entry_date.asc(), PartyLedgerEntry.created_at.asc())
Index("idx_party_ledger_entries_reference", PartyLedgerEntry.reference_type, PartyLedgerEntry.reference_id)
Index("idx_party_ledger_payments_account_date", PartyLedgerPayment.account_id, PartyLedgerPayment.payment_date.desc())
Index("idx_ledger_entries_date", LedgerEntry.entry_date.desc(), LedgerEntry.account_id)
Index("idx_ledger_entries_reference", LedgerEntry.reference_type, LedgerEntry.reference_id)
Index("idx_journal_entries_date", JournalEntry.entry_date.desc())
Index("idx_journal_lines_entry", JournalLine.journal_entry_id, JournalLine.line_no)
