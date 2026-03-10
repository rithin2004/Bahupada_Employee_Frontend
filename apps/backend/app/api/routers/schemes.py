import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, delete, distinct, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import CustomerCategory, Product, Scheme, SchemeProduct
from app.schemas.schemes import SchemeCreate, SchemeOut, SchemeProductOption, SchemeScopeMeta, SchemeUpdate

router = APIRouter()


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


def _product_scope_stmt(*, brand: str | None = None, category: str | None = None, sub_category: str | None = None):
    stmt = select(Product).where(Product.is_active.is_(True))
    if brand:
        stmt = stmt.where(Product.brand == brand)
    if category:
        stmt = stmt.where(Product.category == category)
    if sub_category:
        stmt = stmt.where(Product.sub_category == sub_category)
    return stmt


async def _serialize_scheme(db: AsyncSession, scheme: Scheme) -> dict[str, object]:
    await _require_active_customer_category(db, scheme.customer_category_id)

    category_name = (
        await db.execute(select(CustomerCategory.name).where(CustomerCategory.id == scheme.customer_category_id))
    ).scalar_one()

    product_name: str | None = None
    if scheme.product_id:
        product_name = (
            await db.execute(select(Product.display_name, Product.name).where(Product.id == scheme.product_id))
        ).first()
        product_name = str(product_name[0] or product_name[1]) if product_name else None

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


@router.get("", response_model=list[SchemeOut])
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


@router.post("", response_model=SchemeOut)
async def create_scheme(payload: SchemeCreate, db: AsyncSession = Depends(get_db)):
    await _require_active_customer_category(db, payload.customer_category_id)

    scoped_product: Product | None = None
    if payload.product_id:
        scoped_product = await _require_active_product(db, payload.product_id)
    if payload.reward_type == "FREE_ITEM" and payload.reward_product_id:
        await _require_active_product(db, payload.reward_product_id, field_name="reward_product_id")

    if scoped_product:
        if payload.brand and scoped_product.brand != payload.brand:
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

    scheme = Scheme(**payload.model_dump())
    db.add(scheme)
    await db.commit()
    await db.refresh(scheme)
    return await _serialize_scheme(db, scheme)


@router.patch("/{scheme_id}", response_model=SchemeOut)
async def update_scheme(scheme_id: uuid.UUID, payload: SchemeUpdate, db: AsyncSession = Depends(get_db)):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")

    data = payload.model_dump(exclude_unset=True)
    if "customer_category_id" in data and data["customer_category_id"] is not None:
        await _require_active_customer_category(db, data["customer_category_id"])
    if "product_id" in data and data["product_id"] is not None:
        await _require_active_product(db, data["product_id"])
    if "reward_product_id" in data and data["reward_product_id"] is not None:
        await _require_active_product(db, data["reward_product_id"], field_name="reward_product_id")

    for key, value in data.items():
        setattr(scheme, key, value)

    await db.commit()
    await db.refresh(scheme)
    return await _serialize_scheme(db, scheme)


@router.delete("/{scheme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scheme(scheme_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")

    await db.execute(delete(SchemeProduct).where(SchemeProduct.scheme_id == scheme_id))
    await db.delete(scheme)
    await db.commit()


@router.get("/active", response_model=list[SchemeOut])
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


@router.get("/meta/scope", response_model=SchemeScopeMeta)
async def get_scheme_scope_meta(db: AsyncSession = Depends(get_db)):
    brand_rows = (
        await db.execute(
            select(distinct(Product.brand))
            .where(and_(Product.is_active.is_(True), Product.brand.is_not(None), Product.brand != ""))
            .order_by(Product.brand.asc())
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
    return {
        "brands": [str(item) for item in brand_rows],
        "categories": [str(item) for item in category_rows],
        "sub_categories": [str(item) for item in sub_category_rows],
    }


@router.get("/meta/categories")
async def list_categories_for_brand(brand: str, db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(distinct(Product.category))
            .where(
                and_(
                    Product.is_active.is_(True),
                    Product.brand == brand,
                    Product.category.is_not(None),
                    Product.category != "",
                )
            )
            .order_by(Product.category.asc())
        )
    ).scalars().all()
    return [str(item) for item in rows]


@router.get("/meta/sub-categories")
async def list_sub_categories_for_scope(
    brand: str,
    category: str,
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(distinct(Product.sub_category))
            .where(
                and_(
                    Product.is_active.is_(True),
                    Product.brand == brand,
                    Product.category == category,
                    Product.sub_category.is_not(None),
                    Product.sub_category != "",
                )
            )
            .order_by(Product.sub_category.asc())
        )
    ).scalars().all()
    return [str(item) for item in rows]


@router.get("/meta/products", response_model=list[SchemeProductOption])
async def list_products_for_scheme_scope(
    brand: str,
    category: str,
    sub_category: str,
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            _product_scope_stmt(brand=brand, category=category, sub_category=sub_category).order_by(Product.display_name.asc(), Product.name.asc())
        )
    ).scalars().all()
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


@router.get("/{scheme_id}", response_model=SchemeOut)
async def get_scheme_detail(scheme_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
    return await _serialize_scheme(db, scheme)
