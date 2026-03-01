from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Employee, Salary


def _normalize_paid_status(value: str) -> str:
    return value.strip().upper()


def _compute_net_salary(basic: Decimal, allowance: Decimal, deductions: Decimal) -> Decimal:
    return Decimal(basic) + Decimal(allowance) - Decimal(deductions)


async def create_salary_entry(
    session: AsyncSession,
    *,
    employee_id,
    month: int,
    year: int,
    basic: Decimal,
    allowance: Decimal,
    deductions: Decimal,
) -> Salary:
    employee = await session.get(Employee, employee_id)
    if employee is None:
        raise ValueError("Employee not found")

    salary = Salary(
        employee_id=employee_id,
        month=month,
        year=year,
        basic=basic,
        allowance=allowance,
        deductions=deductions,
        net_salary=_compute_net_salary(basic, allowance, deductions),
        paid_status="PENDING",
    )
    session.add(salary)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ValueError("Salary already exists for employee/month/year") from exc
    await session.refresh(salary)
    return salary


async def create_salary_run(
    session: AsyncSession,
    *,
    month: int,
    year: int,
    warehouse_id=None,
) -> int:
    stmt = select(Employee).where(Employee.is_active.is_(True))
    if warehouse_id is not None:
        stmt = stmt.where(Employee.warehouse_id == warehouse_id)

    employees = (await session.execute(stmt)).scalars().all()
    created = 0

    for employee in employees:
        exists = (
            await session.execute(
                select(Salary.id).where(
                    and_(
                        Salary.employee_id == employee.id,
                        Salary.month == month,
                        Salary.year == year,
                    )
                )
            )
        ).scalar_one_or_none()
        if exists is not None:
            continue
        session.add(
            Salary(
                employee_id=employee.id,
                month=month,
                year=year,
                basic=Decimal("0"),
                allowance=Decimal("0"),
                deductions=Decimal("0"),
                net_salary=Decimal("0"),
                paid_status="PENDING",
            )
        )
        created += 1

    await session.commit()
    return created


async def mark_salary_paid(session: AsyncSession, salary: Salary, paid_status: str) -> Salary:
    salary.paid_status = _normalize_paid_status(paid_status)
    await session.commit()
    await session.refresh(salary)
    return salary
