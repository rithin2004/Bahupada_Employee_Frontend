import uuid
from datetime import date

from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import Product, Scheme, SchemeProduct
from app.schemas.schemes import (
    SchemeCreate,
    SchemeDetailResponse,
    SchemeOut,
    SchemeProductLinkCreate,
    SchemeProductOut,
)

router = APIRouter()


@router.post("", response_model=SchemeOut)
async def create_scheme(payload: SchemeCreate, db: AsyncSession = Depends(get_db)):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be >= start_date")

    scheme = Scheme(**payload.model_dump())
    db.add(scheme)
    await db.commit()
    await db.refresh(scheme)
    return scheme


@router.post("/{scheme_id}/products", response_model=SchemeProductOut)
async def link_scheme_product(
    scheme_id: uuid.UUID, payload: SchemeProductLinkCreate, db: AsyncSession = Depends(get_db)
):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
    product = await db.get(Product, payload.product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if payload.discount_percent is None and payload.free_quantity is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either discount_percent or free_quantity is required",
        )

    link = SchemeProduct(scheme_id=scheme_id, **payload.model_dump())
    db.add(link)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Scheme product already linked") from exc
    await db.refresh(link)
    return link


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
    return rows


@router.get("/{scheme_id}", response_model=SchemeDetailResponse)
async def get_scheme_detail(scheme_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    scheme = await db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not found")
    products = (await db.execute(select(SchemeProduct).where(SchemeProduct.scheme_id == scheme_id))).scalars().all()
    return {"scheme": scheme, "products": products}
