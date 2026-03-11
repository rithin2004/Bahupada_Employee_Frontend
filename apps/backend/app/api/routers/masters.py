import base64
import json
import re
import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, case, func, literal_column, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import get_db
from app.models.entities import (
    AccountType,
    AreaMaster,
    Company,
    Customer,
    CustomerCategory,
    CustomerClass,
    CustomerType,
    Employee,
    EmployeeRole,
    HSNMaster,
    Pricing,
    ProductBrand,
    ProductCategory,
    ProductSubCategory,
    Product,
    Rack,
    Role,
    RouteMaster,
    Unit,
    User,
    Vehicle,
    Vendor,
    Warehouse,
)
from app.schemas.masters import (
    AreaCreate,
    AreaUpdate,
    CompanyCreate,
    CustomerCreate,
    CustomerCategoryCreate,
    CustomerCategoryUpdate,
    EmployeeCreate,
    EmployeeUpdate,
    ProductCreate,
    ProductUpdate,
    RackCreate,
    RackUpdate,
    RoleCreate,
    RouteCreate,
    RouteUpdate,
    VehicleCreate,
    VehicleUpdate,
    VendorCreate,
    VendorUpdate,
    WarehouseCreate,
    WarehouseUpdate,
    CustomerUpdate,
    UnitCreate,
    UnitUpdate,
    HSNMasterCreate,
    HSNMasterUpdate,
    PricingUpdate,
    ProductBrandCreate,
    ProductBrandUpdate,
    ProductCategoryCreate,
    ProductCategoryUpdate,
    ProductSubCategoryCreate,
    ProductSubCategoryUpdate,
)
from app.services.s3_storage import upload_customer_doc

router = APIRouter()


async def _paginate(db: AsyncSession, stmt, page: int, page_size: int):
    # Count from the lightest possible subquery: remove ordering and replace the
    # selected columns with a constant so Postgres does not carry full row shape.
    total_source = stmt.order_by(None).with_only_columns(literal_column("1"), maintain_column_froms=True).subquery()
    total_stmt = select(func.count()).select_from(total_source)
    total = (await db.execute(total_stmt)).scalar_one()
    result = await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))
    items = result.scalars().all()
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    # Don't return raw SQLAlchemy objects inside a Pydantic model; Pydantic v2
    # can't serialize them without explicit schemas. Encode them to JSON first.
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def _encode_products_cursor(created_at: datetime, product_id: str) -> str:
    payload = {"created_at": created_at.isoformat(), "id": product_id}
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")


def _decode_products_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload = json.loads(raw)
        created_at = datetime.fromisoformat(str(payload["created_at"]))
        product_id = uuid.UUID(str(payload["id"]))
        return created_at, product_id
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cursor") from exc


async def _require_active_lookup(db: AsyncSession, model, lookup_id: uuid.UUID | None, label: str):
    if lookup_id is None:
        return None
    obj = await db.get(model, lookup_id)
    if obj is None or not getattr(obj, "is_active", True):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {label}")
    return obj


async def _apply_product_reference_fields(db: AsyncSession, data: dict) -> dict:
    primary_unit_id = data.get("primary_unit_id")
    if primary_unit_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="primary_unit_id is required")

    primary_unit = await _require_active_lookup(db, Unit, primary_unit_id, "primary_unit_id")
    secondary_unit = await _require_active_lookup(db, Unit, data.get("secondary_unit_id"), "secondary_unit_id")
    third_unit = await _require_active_lookup(db, Unit, data.get("third_unit_id"), "third_unit_id")
    brand = await _require_active_lookup(db, ProductBrand, data.get("brand_id"), "brand_id")
    category = await _require_active_lookup(db, ProductCategory, data.get("category_id"), "category_id")
    sub_category = await _require_active_lookup(db, ProductSubCategory, data.get("sub_category_id"), "sub_category_id")

    if sub_category is not None and category is not None and sub_category.category_id not in (None, category.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sub_category_id does not belong to category_id")

    secondary_qty = data.pop("secondary_unit_quantity", None) if "secondary_unit_quantity" in data else None
    third_qty = data.pop("third_unit_quantity", None) if "third_unit_quantity" in data else None

    if secondary_unit is None:
        data["secondary_unit_id"] = None
        data["conv_2_to_1"] = None
    else:
        data["conv_2_to_1"] = secondary_qty

    if third_unit is None:
        data["third_unit_id"] = None
        data["conv_3_to_2"] = None
        data["conv_3_to_1"] = None
    else:
        data["conv_3_to_2"] = third_qty
        if secondary_qty is not None and third_qty is not None:
            data["conv_3_to_1"] = secondary_qty * third_qty
        else:
            data["conv_3_to_1"] = None

    data["unit"] = primary_unit.unit_name
    data["brand"] = getattr(brand, "name", None)
    data["category"] = getattr(category, "name", None)
    data["sub_category"] = getattr(sub_category, "name", None)
    data["display_name"] = data.get("name")
    return data


@router.post("/companies")
async def create_company(payload: CompanyCreate, db: AsyncSession = Depends(get_db)):
    obj = Company(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/areas")
async def create_area(payload: AreaCreate, db: AsyncSession = Depends(get_db)):
    obj = AreaMaster(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/routes")
async def create_route(payload: RouteCreate, db: AsyncSession = Depends(get_db)):
    obj = RouteMaster(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/warehouses")
async def create_warehouse(payload: WarehouseCreate, db: AsyncSession = Depends(get_db)):
    obj = Warehouse(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/racks")
async def create_rack(payload: RackCreate, db: AsyncSession = Depends(get_db)):
    obj = Rack(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/vehicles")
async def create_vehicle(payload: VehicleCreate, db: AsyncSession = Depends(get_db)):
    obj = Vehicle(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/employees")
async def create_employee(payload: EmployeeCreate, db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    username = data.pop("username", None)
    password = data.pop("password", None)
    data["name"] = data["full_name"]
    if data.get("role_id") is None:
        role = await _resolve_role_for_employee_role(db, payload.role)
        if role is not None:
            data["role_id"] = role.id
    obj = Employee(**data)
    db.add(obj)
    await db.flush()
    await _upsert_employee_credentials(db, obj, username, password)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee credentials already exist") from exc
    await db.refresh(obj)
    return obj


@router.post("/products")
async def create_product(payload: ProductCreate, db: AsyncSession = Depends(get_db)):
    data = await _apply_product_reference_fields(db, payload.model_dump())
    obj = Product(**data)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/vendors")
async def create_vendor(payload: VendorCreate, db: AsyncSession = Depends(get_db)):
    obj = Vendor(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/customer-documents/upload")
async def upload_customer_document(
    doc_type: str = Query(..., pattern="^(pan_doc|gst_doc)$"),
    file: UploadFile = File(...),
):
    object_key, public_url = await upload_customer_doc(file, doc_type)
    return {"path": object_key, "url": public_url}


@router.post("/customers")
async def create_customer(payload: CustomerCreate, db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    username = data.pop("username", None)
    password = data.pop("password", None)
    if not data.get("whatsapp_number") and data.get("phone"):
        data["whatsapp_number"] = data["phone"]
    if not data.get("alternate_number") and data.get("alternate_phone"):
        data["alternate_number"] = data["alternate_phone"]
    if not data.get("gst_number") and data.get("gstin"):
        data["gst_number"] = data["gstin"]

    category_id = data.get("customer_category_id")
    if category_id:
        category = await db.get(CustomerCategory, category_id)
        if category is None or not category.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid customer_category_id")
        data["customer_type"] = category.customer_type

    customer_class = data.get("customer_class")
    if data.get("customer_type") is None:
        data["customer_type"] = CustomerType.B2C if customer_class == CustomerClass.B2C else CustomerType.B2B

    if customer_class is None:
        data["customer_class"] = CustomerClass.B2C if data["customer_type"] == CustomerType.B2C else CustomerClass.B2B_SEMI_WHOLESALE

    obj = Customer(**data)
    db.add(obj)
    await db.flush()
    await _upsert_customer_credentials(db, obj, username, password)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer credentials already exist") from exc
    await db.refresh(obj)
    return obj


@router.post("/units")
async def create_unit(payload: UnitCreate, db: AsyncSession = Depends(get_db)):
    obj = Unit(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/hsn")
async def create_hsn(payload: HSNMasterCreate, db: AsyncSession = Depends(get_db)):
    obj = HSNMaster(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/product-brands")
async def create_product_brand(payload: ProductBrandCreate, db: AsyncSession = Depends(get_db)):
    obj = ProductBrand(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/product-categories")
async def create_product_category(payload: ProductCategoryCreate, db: AsyncSession = Depends(get_db)):
    obj = ProductCategory(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/product-sub-categories")
async def create_product_sub_category(payload: ProductSubCategoryCreate, db: AsyncSession = Depends(get_db)):
    if payload.category_id is not None:
        await _require_active_lookup(db, ProductCategory, payload.category_id, "category_id")
    obj = ProductSubCategory(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get("/products")
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    limit: int | None = Query(None, ge=1, le=settings.pagination_max_page_size),
    cursor: str | None = Query(None),
    search: str | None = Query(None),
    include_total: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    # Keep legacy offset pagination for existing modules/tests.
    use_cursor_mode = limit is not None or cursor is not None
    base_stmt = (
        select(
            Product.id.label("id"),
            Product.sku.label("sku"),
            Product.name.label("name"),
            Product.display_name.label("display_name"),
            Product.brand_id.label("brand_id"),
            Product.category_id.label("category_id"),
            Product.sub_category_id.label("sub_category_id"),
            Product.brand.label("brand"),
            Product.category.label("category"),
            Product.sub_category.label("sub_category"),
            Product.description.label("description"),
            Product.hsn_id.label("hsn_id"),
            Product.primary_unit_id.label("primary_unit_id"),
            Product.secondary_unit_id.label("secondary_unit_id"),
            Product.third_unit_id.label("third_unit_id"),
            Product.conv_2_to_1.label("secondary_unit_quantity"),
            Product.conv_3_to_2.label("third_unit_quantity"),
            Product.weight_in_grams.label("weight_in_grams"),
            Product.is_bundle.label("is_bundle"),
            Product.bundle_price_override.label("bundle_price_override"),
            Product.base_price.label("base_price"),
            Product.tax_percent.label("tax_percent"),
            Product.unit.label("unit"),
            Product.is_active.label("is_active"),
            Product.created_at.label("created_at"),
            ProductBrand.name.label("brand_name"),
            ProductCategory.name.label("category_name"),
            ProductSubCategory.name.label("sub_category_name"),
        )
        .select_from(Product)
        .outerjoin(ProductBrand, ProductBrand.id == Product.brand_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
        .outerjoin(ProductSubCategory, ProductSubCategory.id == Product.sub_category_id)
        .where(Product.is_active.is_(True))
    )
    ranking = None
    if search and search.strip():
        term = search.strip()
        q = f"%{term}%"
        q_prefix = f"{term}%"
        base_stmt = base_stmt.where(
            or_(
                Product.sku.ilike(q),
                Product.name.ilike(q),
                Product.display_name.ilike(q),
                Product.brand.ilike(q),
                ProductCategory.name.ilike(q),
                ProductSubCategory.name.ilike(q),
            )
        )
        ranking = case(
            (Product.sku.ilike(term), 0),
            (Product.sku.ilike(q_prefix), 1),
            (Product.name.ilike(q_prefix), 2),
            (Product.display_name.ilike(q_prefix), 3),
            (Product.brand.ilike(q_prefix), 4),
            else_=5,
        )

    if not use_cursor_mode:
        if ranking is not None:
            stmt = base_stmt.order_by(ranking.asc(), Product.created_at.desc())
        else:
            stmt = base_stmt.order_by(Product.created_at.desc())
        total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
        total = (await db.execute(total_stmt)).scalar_one()
        rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).mappings().all()
        items = []
        for row in rows:
            item = dict(row)
            item["brand"] = item.get("brand_name") or item.get("brand")
            item["category"] = item.get("category_name") or item.get("category")
            item["sub_category"] = item.get("sub_category_name") or item.get("sub_category")
            items.append(item)
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        return {
            "items": jsonable_encoder(items),
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    resolved_limit = limit or 50
    cursor_created_at: datetime | None = None
    cursor_id: uuid.UUID | None = None
    if cursor:
        cursor_created_at, cursor_id = _decode_products_cursor(cursor)

    if ranking is not None:
        stmt = base_stmt.order_by(ranking.asc(), Product.created_at.desc(), Product.id.desc())
    else:
        stmt = base_stmt.order_by(Product.created_at.desc(), Product.id.desc())
    if cursor_created_at and cursor_id:
        stmt = stmt.where(
            or_(
                Product.created_at < cursor_created_at,
                and_(Product.created_at == cursor_created_at, Product.id < cursor_id),
            )
        )

    total: int | None = None
    if include_total:
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total = (await db.execute(count_stmt)).scalar_one()
    result = await db.execute(stmt.limit(resolved_limit + 1))
    rows = result.mappings().all()
    has_more = len(rows) > resolved_limit
    items = rows[:resolved_limit]

    next_cursor: str | None = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_products_cursor(last["created_at"], str(last["id"]))

    serialized_items = []
    for row in items:
        item = dict(row)
        item["brand"] = item.get("brand_name") or item.get("brand")
        item["category"] = item.get("category_name") or item.get("category")
        item["sub_category"] = item.get("sub_category_name") or item.get("sub_category")
        serialized_items.append(item)

    return {
        "items": jsonable_encoder(serialized_items),
        "total": total,
        "limit": resolved_limit,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


@router.get("/pricing")
async def list_pricing(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            Product.id.label("product_id"),
            Product.sku.label("sku"),
            func.coalesce(Pricing.mrp, Decimal("0")).label("mrp"),
            func.coalesce(Pricing.cost_price, Decimal("0")).label("cost_price"),
            func.coalesce(Pricing.a_class_price, Decimal("0")).label("a_class_price"),
            func.coalesce(Pricing.b_class_price, Decimal("0")).label("b_class_price"),
            func.coalesce(Pricing.c_class_price, Decimal("0")).label("c_class_price"),
            func.coalesce(Pricing.is_active, True).label("is_active"),
        )
        .select_from(Product)
        .outerjoin(Pricing, Pricing.product_id == Product.id)
        .where(Product.is_active.is_(True))
    )
    if search and search.strip():
        stmt = stmt.where(Product.sku.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(Product.created_at.desc())

    total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(total_stmt)).scalar_one()
    result = await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))
    items = [dict(row) for row in result.mappings().all()]
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/customers")
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            Customer.id.label("id"),
            Customer.name.label("name"),
            Customer.outlet_name.label("outlet_name"),
            Customer.customer_type.label("customer_type"),
            Customer.customer_category_id.label("customer_category_id"),
            CustomerCategory.name.label("category_name"),
            Customer.whatsapp_number.label("whatsapp_number"),
            Customer.alternate_number.label("alternate_number"),
            Customer.gst_number.label("gst_number"),
            Customer.pan_number.label("pan_number"),
            Customer.email.label("email"),
            Customer.credit_limit.label("credit_limit"),
            Customer.is_line_sale_outlet.label("is_line_sale_outlet"),
            Customer.is_active.label("is_active"),
            User.username.label("username"),
            Customer.created_at.label("created_at"),
        )
        .select_from(Customer)
        .outerjoin(CustomerCategory, CustomerCategory.id == Customer.customer_category_id)
        .outerjoin(User, User.customer_id == Customer.id)
        .where(Customer.is_active.is_(True))
        .order_by(Customer.created_at.desc())
    )
    total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(total_stmt)).scalar_one()
    result = await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))
    items = [dict(row) for row in result.mappings().all()]
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("/customer-categories")
async def create_customer_category(payload: CustomerCategoryCreate, db: AsyncSession = Depends(get_db)):
    obj = CustomerCategory(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/roles")
async def create_role(payload: RoleCreate, db: AsyncSession = Depends(get_db)):
    obj = Role(**payload.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get("/customer-categories")
async def list_customer_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CustomerCategory).where(CustomerCategory.is_active.is_(True)).order_by(CustomerCategory.name.asc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/warehouses")
async def list_warehouses(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Warehouse).where(Warehouse.is_active.is_(True)).order_by(Warehouse.created_at.desc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/racks")
async def list_racks(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    warehouse_id: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Rack).where(Rack.is_active.is_(True))
    if warehouse_id:
        try:
            stmt = stmt.where(Rack.warehouse_id == uuid.UUID(warehouse_id))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid warehouse_id") from exc
    if search and search.strip():
        stmt = stmt.where(Rack.rack_type.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(Rack.created_at.desc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/vendors")
async def list_vendors(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Vendor).where(Vendor.is_active.is_(True))
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Vendor.name.ilike(q),
                Vendor.firm_name.ilike(q),
                Vendor.gstin.ilike(q),
                Vendor.city.ilike(q),
                Vendor.phone.ilike(q),
            )
        )
    stmt = stmt.order_by(Vendor.created_at.desc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/areas")
async def list_areas(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AreaMaster).where(AreaMaster.is_active.is_(True))
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                AreaMaster.area_name.ilike(q),
                AreaMaster.city.ilike(q),
                AreaMaster.state.ilike(q),
                AreaMaster.pincode.ilike(q),
            )
        )
    stmt = stmt.order_by(AreaMaster.created_at.desc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/routes")
async def list_routes(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            RouteMaster.id.label("id"),
            RouteMaster.route_name.label("route_name"),
            RouteMaster.area_id.label("area_id"),
            AreaMaster.area_name.label("area_name"),
            RouteMaster.is_active.label("is_active"),
            RouteMaster.created_at.label("created_at"),
        )
        .select_from(RouteMaster)
        .outerjoin(AreaMaster, AreaMaster.id == RouteMaster.area_id)
        .where(RouteMaster.is_active.is_(True))
    )
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                RouteMaster.route_name.ilike(q),
                AreaMaster.area_name.ilike(q),
            )
        )
    stmt = stmt.order_by(RouteMaster.created_at.desc())
    total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(total_stmt)).scalar_one()
    rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).mappings().all()
    items = [dict(row) for row in rows]
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/units")
async def list_units(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Unit)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(or_(Unit.unit_name.ilike(q), Unit.unit_code.ilike(q)))
    stmt = stmt.order_by(Unit.unit_name.asc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/product-brands")
async def list_product_brands(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ProductBrand)
    if search and search.strip():
        stmt = stmt.where(ProductBrand.name.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(ProductBrand.name.asc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/product-categories")
async def list_product_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ProductCategory)
    if search and search.strip():
        stmt = stmt.where(ProductCategory.name.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(ProductCategory.name.asc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/product-sub-categories")
async def list_product_sub_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    category_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            ProductSubCategory.id.label("id"),
            ProductSubCategory.name.label("name"),
            ProductSubCategory.category_id.label("category_id"),
            ProductSubCategory.is_active.label("is_active"),
            ProductSubCategory.created_at.label("created_at"),
            ProductCategory.name.label("category_name"),
        )
        .select_from(ProductSubCategory)
        .outerjoin(ProductCategory, ProductCategory.id == ProductSubCategory.category_id)
    )
    if category_id:
        stmt = stmt.where(ProductSubCategory.category_id == uuid.UUID(category_id))
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(or_(ProductSubCategory.name.ilike(q), ProductCategory.name.ilike(q)))
    stmt = stmt.order_by(ProductSubCategory.name.asc())
    total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(total_stmt)).scalar_one()
    rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).mappings().all()
    items = [dict(row) for row in rows]
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/roles")
async def list_roles(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Role).where(Role.is_active.is_(True))
    if search and search.strip():
        stmt = stmt.where(Role.role_name.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(Role.role_name.asc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/hsn")
async def list_hsn(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(HSNMaster)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(or_(HSNMaster.hsn_code.ilike(q), HSNMaster.description.ilike(q)))
    stmt = stmt.order_by(HSNMaster.hsn_code.asc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/employees")
async def list_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            Employee.id.label("id"),
            Employee.full_name.label("full_name"),
            Employee.role.label("role"),
            Employee.role_id.label("role_id"),
            Role.role_name.label("sub_role_name"),
            Employee.gender.label("gender"),
            Employee.phone.label("phone"),
            Employee.alternate_phone.label("alternate_phone"),
            Employee.email.label("email"),
            Employee.dob.label("dob"),
            Employee.aadhaar_hash.label("aadhaar_hash"),
            Employee.pan_number.label("pan_number"),
            Employee.driver_license_no.label("driver_license_no"),
            Employee.driver_license_expiry.label("driver_license_expiry"),
            Employee.warehouse_id.label("warehouse_id"),
            Warehouse.name.label("warehouse_name"),
            User.username.label("username"),
            Employee.is_active.label("is_active"),
            Employee.created_at.label("created_at"),
        )
        .select_from(Employee)
        .join(Warehouse, Warehouse.id == Employee.warehouse_id)
        .outerjoin(Role, Role.id == Employee.role_id)
        .outerjoin(User, User.employee_id == Employee.id)
        .where(Employee.is_active.is_(True))
    )
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.full_name.ilike(q),
                Employee.phone.ilike(q),
                User.username.ilike(q),
                func.cast(Employee.role, String).ilike(q),
                Warehouse.name.ilike(q),
            )
        )
    stmt = stmt.order_by(Employee.created_at.desc())
    total_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(total_stmt)).scalar_one()
    rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).mappings().all()
    items = [dict(row) for row in rows]
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": jsonable_encoder(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/vehicles")
async def list_vehicles(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.pagination_default_page_size, ge=1, le=settings.pagination_max_page_size),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Vehicle).where(Vehicle.is_active.is_(True))
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Vehicle.registration_no.ilike(q),
                Vehicle.vehicle_name.ilike(q),
            )
        )
    stmt = stmt.order_by(Vehicle.created_at.desc())
    return await _paginate(db, stmt, page, page_size)


@router.get("/routes/{route_id}")
async def get_route(route_id: str, db: AsyncSession = Depends(get_db)):
    return await _get_or_404(db, RouteMaster, uuid.UUID(route_id), "Route")


@router.get("/areas/{area_id}")
async def get_area(area_id: str, db: AsyncSession = Depends(get_db)):
    return await _get_or_404(db, AreaMaster, uuid.UUID(area_id), "Area")


@router.patch("/areas/{area_id}")
async def patch_area(area_id: str, payload: AreaUpdate, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, AreaMaster, uuid.UUID(area_id), "Area")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/areas/{area_id}")
async def deactivate_area(area_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, AreaMaster, uuid.UUID(area_id), "Area")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.patch("/routes/{route_id}")
async def patch_route(route_id: str, payload: RouteUpdate, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, RouteMaster, uuid.UUID(route_id), "Route")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/routes/{route_id}")
async def deactivate_route(route_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, RouteMaster, uuid.UUID(route_id), "Route")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.get("/vehicles/{vehicle_id}")
async def get_vehicle(vehicle_id: str, db: AsyncSession = Depends(get_db)):
    return await _get_or_404(db, Vehicle, uuid.UUID(vehicle_id), "Vehicle")


@router.patch("/vehicles/{vehicle_id}")
async def patch_vehicle(vehicle_id: str, payload: VehicleUpdate, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, Vehicle, uuid.UUID(vehicle_id), "Vehicle")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/vehicles/{vehicle_id}")
async def deactivate_vehicle(vehicle_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, Vehicle, uuid.UUID(vehicle_id), "Vehicle")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


async def _get_or_404(db: AsyncSession, model, entity_id, name: str):
    obj = await db.get(model, entity_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{name} not found")
    return obj


async def _resolve_role_for_employee_role(db: AsyncSession, employee_role: EmployeeRole | None) -> Role | None:
    if employee_role is None:
        return None
    return (
        await db.execute(
            select(Role).where(Role.role_name == employee_role.value, Role.is_active.is_(True)).limit(1)
        )
    ).scalar_one_or_none()


def _slug_username(value: str, fallback_prefix: str, fallback_suffix: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", ".", value.strip().lower()).strip(".")
    if not cleaned:
        cleaned = f"{fallback_prefix}.{fallback_suffix}"
    return cleaned[:80]


def _default_employee_username(employee: Employee) -> str:
    suffix = employee.id.hex[-4:]
    seed = str(employee.email or employee.full_name or employee.phone or "")
    return _slug_username(seed, "emp", suffix)


def _default_customer_username(customer: Customer) -> str:
    suffix = customer.id.hex[-4:]
    seed = str(customer.email or customer.name or customer.whatsapp_number or customer.phone or "")
    return _slug_username(seed, "customer", suffix)


async def _upsert_employee_credentials(
    db: AsyncSession,
    employee: Employee,
    username: str | None,
    password: str | None,
) -> None:
    user = (await db.execute(select(User).where(User.employee_id == employee.id).limit(1))).scalar_one_or_none()
    resolved_username = (username or "").strip() or _default_employee_username(employee)
    resolved_password = (password or "").strip() or "ChangeMe@123"
    if user is None:
        db.add(
            User(
                employee_id=employee.id,
                account_type=AccountType.EMPLOYEE,
                phone=employee.phone,
                email=employee.email,
                username=resolved_username,
                password_hash=hash_password(resolved_password),
                is_active=employee.is_active,
            )
        )
        return

    user.username = resolved_username
    user.phone = employee.phone
    user.email = employee.email
    user.is_active = employee.is_active
    if (password or "").strip():
        user.password_hash = hash_password(password.strip())


async def _upsert_customer_credentials(
    db: AsyncSession,
    customer: Customer,
    username: str | None,
    password: str | None,
) -> None:
    user = (await db.execute(select(User).where(User.customer_id == customer.id).limit(1))).scalar_one_or_none()
    resolved_username = (username or "").strip() or _default_customer_username(customer)
    resolved_password = (password or "").strip() or "ChangeMe@123"
    phone_value = customer.whatsapp_number or customer.phone
    if user is None:
        db.add(
            User(
                customer_id=customer.id,
                account_type=AccountType.CUSTOMER,
                phone=phone_value,
                email=customer.email,
                username=resolved_username,
                password_hash=hash_password(resolved_password),
                is_active=customer.is_active,
            )
        )
        return

    user.username = resolved_username
    user.phone = phone_value
    user.email = customer.email
    user.is_active = customer.is_active
    if (password or "").strip():
        user.password_hash = hash_password(password.strip())


@router.get("/products/{product_id}")
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    return await _get_or_404(db, Product, uuid.UUID(product_id), "Product")


@router.patch("/products/{product_id}")
async def patch_product(product_id: str, payload: ProductUpdate, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Product, uuid.UUID(product_id), "Product")
    patch_data = payload.model_dump(exclude_unset=True)
    if any(
        key in patch_data
        for key in (
            "name",
            "brand_id",
            "category_id",
            "sub_category_id",
            "primary_unit_id",
            "secondary_unit_id",
            "third_unit_id",
            "secondary_unit_quantity",
            "third_unit_quantity",
        )
    ):
        merged = {
            "name": patch_data.get("name", obj.name),
            "brand_id": patch_data.get("brand_id", obj.brand_id),
            "category_id": patch_data.get("category_id", obj.category_id),
            "sub_category_id": patch_data.get("sub_category_id", obj.sub_category_id),
            "primary_unit_id": patch_data.get("primary_unit_id", obj.primary_unit_id),
            "secondary_unit_id": patch_data.get("secondary_unit_id", obj.secondary_unit_id),
            "third_unit_id": patch_data.get("third_unit_id", obj.third_unit_id),
            "secondary_unit_quantity": patch_data.get("secondary_unit_quantity", obj.conv_2_to_1),
            "third_unit_quantity": patch_data.get("third_unit_quantity", obj.conv_3_to_2),
        }
        patch_data.update(await _apply_product_reference_fields(db, merged))
        patch_data.pop("name", None)
        patch_data["name"] = merged["name"]
    for key, value in patch_data.items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/products/{product_id}")
async def deactivate_product(product_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Product, uuid.UUID(product_id), "Product")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    return await _get_or_404(db, Customer, uuid.UUID(customer_id), "Customer")


@router.patch("/customers/{customer_id}")
async def patch_customer(customer_id: str, payload: CustomerUpdate, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Customer, uuid.UUID(customer_id), "Customer")
    patch_data = payload.model_dump(exclude_unset=True)
    username = patch_data.pop("username", None) if "username" in patch_data else None
    password = patch_data.pop("password", None) if "password" in patch_data else None
    if "phone" in patch_data and "whatsapp_number" not in patch_data:
        patch_data["whatsapp_number"] = patch_data["phone"]
    if "gstin" in patch_data and "gst_number" not in patch_data:
        patch_data["gst_number"] = patch_data["gstin"]
    if "customer_category_id" in patch_data and patch_data["customer_category_id"]:
        category = await db.get(CustomerCategory, patch_data["customer_category_id"])
        if category is None or not category.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid customer_category_id")
        if "customer_type" not in patch_data:
            patch_data["customer_type"] = category.customer_type
    if "customer_class" in patch_data and "customer_type" not in patch_data:
        patch_data["customer_type"] = CustomerType.B2C if patch_data["customer_class"] == CustomerClass.B2C else CustomerType.B2B
    for key, value in patch_data.items():
        setattr(obj, key, value)
    await _upsert_customer_credentials(db, obj, username, password)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer credentials already exist") from exc
    await db.refresh(obj)
    return obj


@router.patch("/customer-categories/{category_id}")
async def patch_customer_category(category_id: str, payload: CustomerCategoryUpdate, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, CustomerCategory, uuid.UUID(category_id), "CustomerCategory")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/customers/{customer_id}")
async def deactivate_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Customer, uuid.UUID(customer_id), "Customer")
    obj.is_active = False
    user = (await db.execute(select(User).where(User.customer_id == obj.id).limit(1))).scalar_one_or_none()
    if user is not None:
        user.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.get("/warehouses/{warehouse_id}")
async def get_warehouse(warehouse_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    return await _get_or_404(db, Warehouse, uuid.UUID(warehouse_id), "Warehouse")


@router.patch("/warehouses/{warehouse_id}")
async def patch_warehouse(warehouse_id: str, payload: WarehouseUpdate, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Warehouse, uuid.UUID(warehouse_id), "Warehouse")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/warehouses/{warehouse_id}")
async def deactivate_warehouse(warehouse_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Warehouse, uuid.UUID(warehouse_id), "Warehouse")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.get("/racks/{rack_id}")
async def get_rack(rack_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    return await _get_or_404(db, Rack, uuid.UUID(rack_id), "Rack")


@router.patch("/racks/{rack_id}")
async def patch_rack(rack_id: str, payload: RackUpdate, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Rack, uuid.UUID(rack_id), "Rack")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/racks/{rack_id}")
async def deactivate_rack(rack_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Rack, uuid.UUID(rack_id), "Rack")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.get("/vendors/{vendor_id}")
async def get_vendor(vendor_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    return await _get_or_404(db, Vendor, uuid.UUID(vendor_id), "Vendor")


@router.patch("/vendors/{vendor_id}")
async def patch_vendor(vendor_id: str, payload: VendorUpdate, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Vendor, uuid.UUID(vendor_id), "Vendor")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/vendors/{vendor_id}")
async def deactivate_vendor(vendor_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Vendor, uuid.UUID(vendor_id), "Vendor")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.patch("/units/{unit_id}")
async def patch_unit(unit_id: str, payload: UnitUpdate, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, Unit, uuid.UUID(unit_id), "Unit")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/hsn/{hsn_id}")
async def patch_hsn(hsn_id: str, payload: HSNMasterUpdate, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, HSNMaster, uuid.UUID(hsn_id), "HSN")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/product-brands/{brand_id}")
async def patch_product_brand(brand_id: str, payload: ProductBrandUpdate, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, ProductBrand, uuid.UUID(brand_id), "ProductBrand")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/product-categories/{category_id}")
async def patch_product_category(category_id: str, payload: ProductCategoryUpdate, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, ProductCategory, uuid.UUID(category_id), "ProductCategory")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/product-sub-categories/{sub_category_id}")
async def patch_product_sub_category(
    sub_category_id: str,
    payload: ProductSubCategoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, ProductSubCategory, uuid.UUID(sub_category_id), "ProductSubCategory")
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and data["category_id"] is not None:
        await _require_active_lookup(db, ProductCategory, data["category_id"], "category_id")
    for key, value in data.items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/pricing/{product_id}")
async def patch_pricing(product_id: str, payload: PricingUpdate, db: AsyncSession = Depends(get_db)):
    product_uuid = uuid.UUID(product_id)
    _ = await _get_or_404(db, Product, product_uuid, "Product")
    pricing = (await db.execute(select(Pricing).where(Pricing.product_id == product_uuid))).scalar_one_or_none()
    if pricing is None:
        pricing = Pricing(product_id=product_uuid)
        db.add(pricing)
        await db.flush()

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(pricing, key, value)

    mrp = Decimal(pricing.mrp or 0)
    if mrp > 0:
        pricing.pct_diff_a_mrp = ((Decimal(pricing.a_class_price or 0) - mrp) / mrp) * Decimal("100")
        pricing.pct_diff_b_mrp = ((Decimal(pricing.b_class_price or 0) - mrp) / mrp) * Decimal("100")
        pricing.pct_diff_c_mrp = ((Decimal(pricing.c_class_price or 0) - mrp) / mrp) * Decimal("100")
    else:
        pricing.pct_diff_a_mrp = None
        pricing.pct_diff_b_mrp = None
        pricing.pct_diff_c_mrp = None

    await db.commit()
    await db.refresh(pricing)
    return pricing


@router.delete("/hsn/{hsn_id}")
async def deactivate_hsn(hsn_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, HSNMaster, uuid.UUID(hsn_id), "HSN")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.delete("/product-brands/{brand_id}")
async def deactivate_product_brand(brand_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, ProductBrand, uuid.UUID(brand_id), "ProductBrand")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.delete("/product-categories/{category_id}")
async def deactivate_product_category(category_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, ProductCategory, uuid.UUID(category_id), "ProductCategory")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.delete("/product-sub-categories/{sub_category_id}")
async def deactivate_product_sub_category(sub_category_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, ProductSubCategory, uuid.UUID(sub_category_id), "ProductSubCategory")
    obj.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}


@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, db: AsyncSession = Depends(get_db)):
    obj = await _get_or_404(db, Unit, uuid.UUID(unit_id), "Unit")
    await db.delete(obj)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unit is referenced by products and cannot be deleted",
        ) from exc
    return {"id": str(unit_id), "deleted": True}


@router.get("/employees/{employee_id}")
async def get_employee(employee_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    return await _get_or_404(db, Employee, uuid.UUID(employee_id), "Employee")


@router.patch("/employees/{employee_id}")
async def patch_employee(employee_id: str, payload: EmployeeUpdate, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Employee, uuid.UUID(employee_id), "Employee")
    data = payload.model_dump(exclude_unset=True)
    username = data.pop("username", None) if "username" in data else None
    password = data.pop("password", None) if "password" in data else None
    if "full_name" in data:
        obj.full_name = data["full_name"]
        obj.name = data["full_name"]
        data.pop("full_name")
    if "role" in data and data["role"] is not None and "role_id" not in data:
        role = await _resolve_role_for_employee_role(db, data["role"])
        if role is not None:
            data["role_id"] = role.id
    for key, value in data.items():
        setattr(obj, key, value)
    await _upsert_employee_credentials(db, obj, username, password)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Employee credentials already exist") from exc
    await db.refresh(obj)
    return obj


@router.delete("/employees/{employee_id}")
async def deactivate_employee(employee_id: str, db: AsyncSession = Depends(get_db)):
    import uuid

    obj = await _get_or_404(db, Employee, uuid.UUID(employee_id), "Employee")
    obj.is_active = False
    user = (await db.execute(select(User).where(User.employee_id == obj.id).limit(1))).scalar_one_or_none()
    if user is not None:
        user.is_active = False
    await db.commit()
    return {"id": str(obj.id), "is_active": obj.is_active}
