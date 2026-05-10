import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, delete, distinct, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.auth import require_permission
from app.db.session import get_db
from app.models.entities import CustomerCategory, Product, ProductBrand, Scheme, SchemeProduct
from app.schemas.schemes import SchemeCreate, SchemeOut, SchemeProductOption, SchemeScopeMeta, SchemeUpdate

router = APIRouter()


def _scheme_type_from_reward(reward_type: str) -> str:
    if reward_type == "DISCOUNT":
        return "DISCOUNT"
    if reward_type == "FREE_ITEM":
        return "FREE_ITEM"
    return "DISCOUNT"


async def _require_active_customer_category(db: AsyncSession, category_id: uuid.UUID) -> CustomerCategory:
    category = await db.get(CustomerCategory, category_id)
    if category is None or not category.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid customer_category_id")
    return category


async def _require_active_product(db: AsyncSession, product_id: uuid.UUID, *, field_name: str = "product_id") -> Product:
    product = await db.get(Product, product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return product


async def _load_scheme_product_ids(db: AsyncSession, scheme_id: uuid.UUID) -> list[uuid.UUID]:
    rows = (
        await db.execute(select(SchemeProduct.product_id).where(SchemeProduct.scheme_id == scheme_id).order_by(SchemeProduct.id.asc()))
    ).scalars().all()
    return [uuid.UUID(str(row)) if not isinstance(row, uuid.UUID) else row for row in rows]


async def _sync_scheme_products(db: AsyncSession, scheme: Scheme, product_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    normalized_ids = list(dict.fromkeys(product_ids))
    existing_rows = (
        await db.execute(select(SchemeProduct).where(SchemeProduct.scheme_id == scheme.id))
    ).scalars().all()
    existing_by_product = {row.product_id: row for row in existing_rows}
    keep_ids = set(normalized_ids)
    for row in existing_rows:
        if row.product_id not in keep_ids:
            await db.delete(row)
    for index, product_id in enumerate(normalized_ids):
        if product_id in existing_by_product:
            continue
        db.add(SchemeProduct(scheme_id=scheme.id, product_id=product_id))
    scheme.product_id = normalized_ids[0] if normalized_ids else None
    await db.flush()
    return normalized_ids


async def _effective_brand_name_for_product(db: AsyncSession, product: Product) -> str | None:
    """Resolve display brand: denormalized string, else name from product_brands."""
    if (product.brand or "").strip():
        return product.brand.strip()
    if product.brand_id:
        name = await db.scalar(select(ProductBrand.name).where(ProductBrand.id == product.brand_id))
        return (name or "").strip() or None
    return None


def _product_matches_brand(brand: str):
    """Match either denormalized Product.brand or FK-linked ProductBrand.name (common when only brand_id is set)."""
    return or_(Product.brand == brand, ProductBrand.name == brand)


def _product_scope_stmt(*, brand: str | None = None, category: str | None = None, sub_category: str | None = None):
    stmt = select(Product).where(Product.is_active.is_(True))
    if brand:
        stmt = stmt.outerjoin(ProductBrand, Product.brand_id == ProductBrand.id).where(_product_matches_brand(brand))
    if category:
        stmt = stmt.where(Product.category == category)
    if sub_category:
        stmt = stmt.where(Product.sub_category == sub_category)
    return stmt


async def _serialize_scheme(db: AsyncSession, scheme: Scheme) -> dict[str, object]:
    if scheme.customer_category_id is not None:
        await _require_active_customer_category(db, scheme.customer_category_id)
        category_name = (
            await db.execute(select(CustomerCategory.name).where(CustomerCategory.id == scheme.customer_category_id))
        ).scalar_one()
    else:
        category_name = "All categories"

    product_ids = await _load_scheme_product_ids(db, scheme.id)
    if not product_ids and scheme.product_id is not None:
        product_ids = [scheme.product_id]
    product_names: list[str] = []
    if product_ids:
        rows = (
            await db.execute(
                select(Product.id, Product.display_name, Product.name).where(Product.id.in_(product_ids))
            )
        ).all()
        product_name_by_id = {
            row[0]: str(row[1] or row[2]) for row in rows if row[0] is not None
        }
        product_names = [product_name_by_id.get(product_id, "") for product_id in product_ids if product_id in product_name_by_id]
    product_name: str | None = product_names[0] if product_names else None

    reward_product_name: str | None = None
    if scheme.reward_product_id:
        reward_product = (
            await db.execute(select(Product.display_name, Product.name).where(Product.id == scheme.reward_product_id))
        ).first()
        reward_product_name = str(reward_product[0] or reward_product[1]) if reward_product else None

    return {
        "id": scheme.id,
        "scheme_name": scheme.scheme_name,
        "customer_category_id": scheme.customer_category_id,
        "customer_category_name": category_name,
        "condition_basis": scheme.condition_basis,
        "threshold_value": scheme.threshold_value,
        "threshold_unit": scheme.threshold_unit,
        "brand": scheme.brand,
        "category": scheme.category,
        "sub_category": scheme.sub_category,
        "product_id": scheme.product_id,
        "product_name": product_name,
        "product_ids": product_ids,
        "product_names": product_names,
        "reward_type": scheme.reward_type,
        "reward_discount_percent": scheme.reward_discount_percent,
        "reward_product_id": scheme.reward_product_id,
        "reward_product_name": reward_product_name,
        "reward_product_quantity": scheme.reward_product_quantity,
        "note": scheme.note,
        "start_date": scheme.start_date,
        "end_date": scheme.end_date,
        "is_active": scheme.is_active,
    }


@router.get("", response_model=list[SchemeOut], dependencies=[Depends(require_permission("schemes", "read"))])
async def list_schemes(
    search: str | None = Query(None),
    status_filter: str | None = Query(default=None, alias="status"),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Scheme)
    normalized_status = (status_filter or "").strip().upper()
    if normalized_status == "ACTIVE":
        stmt = stmt.where(Scheme.is_active.is_(True))
    elif normalized_status == "INACTIVE":
        stmt = stmt.where(Scheme.is_active.is_(False))
    elif active_only:
        # Backward compatibility for existing clients.
        stmt = stmt.where(Scheme.is_active.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Scheme.scheme_name.ilike(term),
                Scheme.brand.ilike(term),
                Scheme.category.ilike(term),
                Scheme.sub_category.ilike(term),
            )
        )
    rows = (await db.execute(stmt.order_by(Scheme.created_at.desc(), Scheme.scheme_name.asc()))).scalars().all()
    return [await _serialize_scheme(db, row) for row in rows]


@router.post("", response_model=SchemeOut, dependencies=[Depends(require_permission("schemes", "create"))])
async def create_scheme(payload: SchemeCreate, db: AsyncSession = Depends(get_db)):
    if payload.customer_category_id is not None:
        await _require_active_customer_category(db, payload.customer_category_id)

    selected_product_ids = list(
        dict.fromkeys([*list(payload.product_ids or []), *([payload.product_id] if payload.product_id else [])])
    )
    scoped_products: list[Product] = []
    for product_id in selected_product_ids:
        scoped_products.append(await _require_active_product(db, product_id))
    if payload.reward_type == "FREE_ITEM" and payload.reward_product_id:
        await _require_active_product(db, payload.reward_product_id, field_name="reward_product_id")

    for scoped_product in scoped_products:
        if payload.brand:
            eff_brand = await _effective_brand_name_for_product(db, scoped_product)
            if eff_brand != payload.brand:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected product does not match the chosen brand")
        if payload.category and scoped_product.category != payload.category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected product does not match the chosen category",
            )
        if payload.sub_category and scoped_product.sub_category != payload.sub_category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected product does not match the chosen sub-category",
            )

    data = payload.model_dump()
    data["scheme_type"] = _scheme_type_from_reward(payload.reward_type)
    data["product_id"] = selected_product_ids[0] if selected_product_ids else None
    data.pop("product_ids", None)
    scheme = Scheme(**data)
    db.add(scheme)
    await db.commit()
    await db.refresh(scheme)
    if selected_product_ids:
        await _sync_scheme_products(db, scheme, selected_product_ids)
        await db.commit()
        await db.refresh(scheme)
    return await _serialize_scheme(db, scheme)


@router.patch("/{scheme_id}", response_model=SchemeOut, dependencies=[Depends(require_permission("schemes", "update"))])
async def update_scheme(scheme_id: uuid.UUID, payload: SchemeUpdate, db: AsyncSession = Depends(get_db)):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")

    data = payload.model_dump(exclude_unset=True)
    product_ids = data.pop("product_ids", None) if "product_ids" in data else None
    if "reward_type" in data:
        data["scheme_type"] = _scheme_type_from_reward(data["reward_type"])
    if "customer_category_id" in data and data["customer_category_id"] is not None:
        await _require_active_customer_category(db, data["customer_category_id"])
    selected_product_ids = list(
        dict.fromkeys([*list(product_ids or []), *([data["product_id"]] if data.get("product_id") else [])])
    )
    if selected_product_ids:
        for product_id in selected_product_ids:
            await _require_active_product(db, product_id)
    if "reward_product_id" in data and data["reward_product_id"] is not None:
        await _require_active_product(db, data["reward_product_id"], field_name="reward_product_id")

    for key, value in data.items():
        setattr(scheme, key, value)
    if product_ids is not None or "product_id" in data:
        await _sync_scheme_products(db, scheme, selected_product_ids)

    await db.commit()
    await db.refresh(scheme)
    return await _serialize_scheme(db, scheme)


@router.delete("/{scheme_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("schemes", "delete"))])
async def delete_scheme(scheme_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")

    await db.execute(delete(SchemeProduct).where(SchemeProduct.scheme_id == scheme_id))
    await db.delete(scheme)
    await db.commit()


@router.get("/active", response_model=list[SchemeOut], dependencies=[Depends(require_permission("schemes", "read"))])
async def list_active_schemes(on_date: date | None = None, db: AsyncSession = Depends(get_db)):
    target = on_date or date.today()
    rows = (
        await db.execute(
            select(Scheme)
            .where(
                and_(
                    Scheme.is_active.is_(True),
                    Scheme.start_date <= target,
                    Scheme.end_date >= target,
                )
            )
            .order_by(Scheme.start_date.asc(), Scheme.created_at.asc())
        )
    ).scalars().all()
    return [await _serialize_scheme(db, row) for row in rows]


@router.get("/meta/scope", response_model=SchemeScopeMeta, dependencies=[Depends(require_permission("schemes", "read"))])
async def get_scheme_scope_meta(db: AsyncSession = Depends(get_db)):
    effective_brand = case(
        (and_(Product.brand.isnot(None), Product.brand != ""), Product.brand),
        else_=ProductBrand.name,
    )
    brand_rows = (
        await db.execute(
            select(distinct(effective_brand))
            .select_from(Product)
            .outerjoin(ProductBrand, Product.brand_id == ProductBrand.id)
            .where(
                Product.is_active.is_(True),
                effective_brand.isnot(None),
                effective_brand != "",
            )
        )
    ).scalars().all()
    category_rows = (
        await db.execute(
            select(distinct(Product.category))
            .where(and_(Product.is_active.is_(True), Product.category.is_not(None), Product.category != ""))
            .order_by(Product.category.asc())
        )
    ).scalars().all()
    sub_category_rows = (
        await db.execute(
            select(distinct(Product.sub_category))
            .where(and_(Product.is_active.is_(True), Product.sub_category.is_not(None), Product.sub_category != ""))
            .order_by(Product.sub_category.asc())
        )
    ).scalars().all()
    brand_list = sorted({str(b) for b in brand_rows if b})
    return {
        "brands": brand_list,
        "categories": [str(item) for item in category_rows],
        "sub_categories": [str(item) for item in sub_category_rows],
    }


@router.get("/meta/categories", dependencies=[Depends(require_permission("schemes", "read"))])
async def list_categories_for_brand(brand: str, db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(distinct(Product.category))
            .select_from(Product)
            .outerjoin(ProductBrand, Product.brand_id == ProductBrand.id)
            .where(
                and_(
                    Product.is_active.is_(True),
                    _product_matches_brand(brand),
                    Product.category.is_not(None),
                    Product.category != "",
                )
            )
            .order_by(Product.category.asc())
        )
    ).scalars().all()
    return [str(item) for item in rows]


@router.get("/meta/sub-categories", dependencies=[Depends(require_permission("schemes", "read"))])
async def list_sub_categories_for_scope(
    brand: str,
    category: str,
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(distinct(Product.sub_category))
            .select_from(Product)
            .outerjoin(ProductBrand, Product.brand_id == ProductBrand.id)
            .where(
                and_(
                    Product.is_active.is_(True),
                    _product_matches_brand(brand),
                    Product.category == category,
                    Product.sub_category.is_not(None),
                    Product.sub_category != "",
                )
            )
            .order_by(Product.sub_category.asc())
        )
    ).scalars().all()
    return [str(item) for item in rows]


@router.get("/meta/products", response_model=list[SchemeProductOption], dependencies=[Depends(require_permission("schemes", "read"))])
async def list_products_for_scheme_scope(
    q: str | None = Query(None),
    brand: str | None = None,
    category: str | None = None,
    sub_category: str | None = None,
    limit: int = Query(500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
):
    stmt = _product_scope_stmt(
        brand=brand.strip() if brand else None,
        category=category.strip() if category else None,
        sub_category=sub_category.strip() if sub_category else None,
    )
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.sku.ilike(term),
                Product.name.ilike(term),
                Product.display_name.ilike(term),
                Product.brand.ilike(term),
                Product.category.ilike(term),
                Product.sub_category.ilike(term),
            )
        )
    rows = (await db.execute(stmt.order_by(Product.display_name.asc(), Product.name.asc()).limit(limit))).scalars().all()
    return [
        {
            "id": row.id,
            "sku": row.sku,
            "name": row.name,
            "display_name": row.display_name,
            "brand": row.brand,
            "category": row.category,
            "sub_category": row.sub_category,
        }
        for row in rows
    ]


@router.get("/meta/reward-products", dependencies=[Depends(require_permission("schemes", "read"))])
async def list_reward_products_for_scheme(
    q: str | None = Query(None),
    brand: str | None = Query(None, description="When set, only products for this brand (matches denormalized brand or product_brands.name)."),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Active products for free-item reward picker (schemes permission; does not require products.read)."""
    stmt = select(Product).where(Product.is_active.is_(True))
    if brand and brand.strip():
        stmt = stmt.outerjoin(ProductBrand, Product.brand_id == ProductBrand.id).where(_product_matches_brand(brand.strip()))
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.sku.ilike(term),
                Product.name.ilike(term),
                Product.display_name.ilike(term),
                Product.brand.ilike(term),
            )
        )
    stmt = stmt.order_by(Product.name.asc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "items": [
            {
                "id": row.id,
                "sku": row.sku,
                "name": row.name,
                "display_name": row.display_name,
                "brand": row.brand,
                "category": row.category,
                "sub_category": row.sub_category,
            }
            for row in rows
        ]
    }


@router.get("/{scheme_id}", response_model=SchemeOut, dependencies=[Depends(require_permission("schemes", "read"))])
async def get_scheme_detail(scheme_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
    return await _serialize_scheme(db, scheme)
