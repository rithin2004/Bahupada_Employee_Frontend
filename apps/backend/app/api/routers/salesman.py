import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import Employee, EmployeeRole, SalesmanDailyAssignment, SalesmanVisit
from app.schemas.salesman import SalesmanPerformanceResponse, SalesmanVisitCreate, SalesmanVisitOut

router = APIRouter()


@router.post("/visits", response_model=SalesmanVisitOut)
async def mark_salesman_visit(payload: SalesmanVisitCreate, db: AsyncSession = Depends(get_db)):
    salesman = await db.get(Employee, payload.salesman_id)
    if salesman is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salesman not found")
    if salesman.role != EmployeeRole.SALESMAN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="salesman_id must have role SALESMAN")
    row = SalesmanVisit(**payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/visits", response_model=list[SalesmanVisitOut])
async def list_salesman_visits(
    salesman_id: uuid.UUID | None = None,
    customer_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SalesmanVisit).order_by(SalesmanVisit.visit_date.desc(), SalesmanVisit.created_at.desc())
    if salesman_id is not None:
        stmt = stmt.where(SalesmanVisit.salesman_id == salesman_id)
    if customer_id is not None:
        stmt = stmt.where(SalesmanVisit.customer_id == customer_id)
    return (await db.execute(stmt)).scalars().all()


@router.get("/performance/{salesman_id}", response_model=SalesmanPerformanceResponse)
async def salesman_performance(salesman_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    planned_count = (
        await db.execute(select(func.count(SalesmanDailyAssignment.id)).where(SalesmanDailyAssignment.salesman_id == salesman_id))
    ).scalar_one()
    visited_count = (
        await db.execute(select(func.count(SalesmanVisit.id)).where(SalesmanVisit.salesman_id == salesman_id))
    ).scalar_one()
    adherence = Decimal("0")
    if planned_count:
        adherence = (Decimal(visited_count) / Decimal(planned_count) * Decimal("100")).quantize(Decimal("0.01"))
    return {
        "salesman_id": salesman_id,
        "planned_count": int(planned_count or 0),
        "visited_count": int(visited_count or 0),
        "adherence_percent": adherence,
    }
