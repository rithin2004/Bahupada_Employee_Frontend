import uuid

from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import Salary
from app.schemas.payroll import (
    SalaryCreate,
    SalaryMarkPaidRequest,
    SalaryOut,
    SalaryRunRequest,
    SalaryRunResponse,
)
from app.services.payroll import create_salary_entry, create_salary_run, mark_salary_paid

router = APIRouter()


@router.post("/salaries", response_model=SalaryOut)
async def create_salary(payload: SalaryCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await create_salary_entry(
            db,
            employee_id=payload.employee_id,
            month=payload.month,
            year=payload.year,
            basic=payload.basic,
            allowance=payload.allowance,
            deductions=payload.deductions,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/salary-runs", response_model=SalaryRunResponse)
async def create_monthly_salary_run(payload: SalaryRunRequest, db: AsyncSession = Depends(get_db)):
    created_count = await create_salary_run(
        db,
        month=payload.month,
        year=payload.year,
        warehouse_id=payload.warehouse_id,
    )
    return {"created_count": created_count}


@router.get("/salaries", response_model=list[SalaryOut])
async def list_salaries(
    month: int | None = None,
    year: int | None = None,
    employee_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Salary).order_by(Salary.year.desc(), Salary.month.desc(), Salary.created_at.desc())
    if month is not None:
        stmt = stmt.where(Salary.month == month)
    if year is not None:
        stmt = stmt.where(Salary.year == year)
    if employee_id is not None:
        stmt = stmt.where(Salary.employee_id == employee_id)
    return (await db.execute(stmt)).scalars().all()


@router.patch("/salaries/{salary_id}/mark-paid", response_model=SalaryOut)
async def patch_mark_salary_paid(
    salary_id: uuid.UUID, payload: SalaryMarkPaidRequest, db: AsyncSession = Depends(get_db)
):
    salary = await db.get(Salary, salary_id)
    if salary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary not found")
    return await mark_salary_paid(db, salary, payload.paid_status)
