import uuid
from datetime import date

from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import (
    DeliveryDailyAssignment,
    DeliveryMonthlyPlan,
    Employee,
    EmployeeRole,
    RouteMaster,
    SalesmanDailyAssignment,
    SalesmanMonthlyPlan,
    Vehicle,
)
from app.schemas.planning import (
    DeliveryDailyAssignmentOut,
    DeliveryDailyAssignmentUpsert,
    SalesmanDailyAssignmentOut,
    SalesmanDailyAssignmentUpsert,
    SalesmanMonthlyPlanCreate,
    SalesmanMonthlyPlanOut,
)

router = APIRouter()


@router.post("/salesman/monthly-plans", response_model=SalesmanMonthlyPlanOut)
async def create_salesman_monthly_plan(payload: SalesmanMonthlyPlanCreate, db: AsyncSession = Depends(get_db)):
    plan = SalesmanMonthlyPlan(**payload.model_dump())
    db.add(plan)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Plan name already exists") from exc
    await db.refresh(plan)
    return plan


@router.post(
    "/salesman/monthly-plans/{monthly_plan_id}/assignments",
    response_model=SalesmanDailyAssignmentOut,
)
async def upsert_salesman_daily_assignment(
    monthly_plan_id: uuid.UUID,
    payload: SalesmanDailyAssignmentUpsert,
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(SalesmanMonthlyPlan, monthly_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salesman monthly plan not found")

    salesman = await db.get(Employee, payload.salesman_id)
    if salesman is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salesman not found")
    if salesman.role != EmployeeRole.SALESMAN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="salesman_id must have role SALESMAN")

    route = await db.get(RouteMaster, payload.route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    existing = (
        await db.execute(
            select(SalesmanDailyAssignment).where(
                SalesmanDailyAssignment.monthly_plan_id == monthly_plan_id,
                SalesmanDailyAssignment.duty_date == payload.duty_date,
                SalesmanDailyAssignment.salesman_id == payload.salesman_id,
            )
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = SalesmanDailyAssignment(monthly_plan_id=monthly_plan_id, **payload.model_dump())
        db.add(existing)
    else:
        existing.route_id = payload.route_id
        existing.note = payload.note
        existing.is_override = payload.is_override

    await db.commit()
    await db.refresh(existing)
    return existing


@router.get(
    "/salesman/monthly-plans/{monthly_plan_id}/assignments",
    response_model=list[SalesmanDailyAssignmentOut],
)
async def list_salesman_daily_assignments(
    monthly_plan_id: uuid.UUID,
    duty_date: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SalesmanDailyAssignment).where(SalesmanDailyAssignment.monthly_plan_id == monthly_plan_id)
    if duty_date is not None:
        stmt = stmt.where(SalesmanDailyAssignment.duty_date == duty_date)
    stmt = stmt.order_by(SalesmanDailyAssignment.duty_date.asc(), SalesmanDailyAssignment.created_at.asc())
    return (await db.execute(stmt)).scalars().all()


@router.post(
    "/delivery/monthly-plans/{monthly_plan_id}/assignments",
    response_model=DeliveryDailyAssignmentOut,
)
async def upsert_delivery_daily_assignment(
    monthly_plan_id: uuid.UUID,
    payload: DeliveryDailyAssignmentUpsert,
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(DeliveryMonthlyPlan, monthly_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery monthly plan not found")

    if payload.vehicle_id is not None:
        vehicle = await db.get(Vehicle, payload.vehicle_id)
        if vehicle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

    role_map = {
        "driver_id": EmployeeRole.DRIVER,
        "helper_id": EmployeeRole.IN_VEHICLE_HELPER,
        "bill_manager_id": EmployeeRole.BILL_MANAGER,
        "loader_id": EmployeeRole.LOADER,
    }
    for field_name, required_role in role_map.items():
        employee_id = getattr(payload, field_name)
        if employee_id is None:
            continue
        employee = await db.get(Employee, employee_id)
        if employee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Employee not found: {field_name}")
        if employee.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must have role {required_role.value}",
            )

    existing = (
        await db.execute(
            select(DeliveryDailyAssignment).where(
                DeliveryDailyAssignment.monthly_plan_id == monthly_plan_id,
                DeliveryDailyAssignment.duty_date == payload.duty_date,
            )
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = DeliveryDailyAssignment(monthly_plan_id=monthly_plan_id, **payload.model_dump())
        db.add(existing)
    else:
        existing.vehicle_id = payload.vehicle_id
        existing.driver_id = payload.driver_id
        existing.helper_id = payload.helper_id
        existing.bill_manager_id = payload.bill_manager_id
        existing.loader_id = payload.loader_id

    await db.commit()
    await db.refresh(existing)
    return existing


@router.get(
    "/delivery/monthly-plans/{monthly_plan_id}/assignments",
    response_model=list[DeliveryDailyAssignmentOut],
)
async def list_delivery_daily_assignments(
    monthly_plan_id: uuid.UUID,
    duty_date: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DeliveryDailyAssignment).where(DeliveryDailyAssignment.monthly_plan_id == monthly_plan_id)
    if duty_date is not None:
        stmt = stmt.where(DeliveryDailyAssignment.duty_date == duty_date)
    stmt = stmt.order_by(DeliveryDailyAssignment.duty_date.asc(), DeliveryDailyAssignment.created_at.asc())
    return (await db.execute(stmt)).scalars().all()
