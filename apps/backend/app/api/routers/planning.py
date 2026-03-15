import uuid
from datetime import date

from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.routers.auth import require_permission
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
    DeliveryDailyAssignmentSummary,
    DeliveryDailyAssignmentOut,
    DeliveryDailyAssignmentUpsert,
    DeliveryMonthlyPlanCreate,
    DeliveryMonthlyPlanOut,
    SalesmanDailyAssignmentOut,
    SalesmanDailyAssignmentUpsert,
    SalesmanMonthlyPlanCreate,
    SalesmanMonthlyPlanOut,
)

router = APIRouter()


@router.get("/salesman/monthly-plans", response_model=list[SalesmanMonthlyPlanOut], dependencies=[Depends(require_permission("planning", "read"))])
async def list_salesman_monthly_plans(
    month: int | None = None,
    year: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SalesmanMonthlyPlan)
    if month is not None:
        stmt = stmt.where(SalesmanMonthlyPlan.month == month)
    if year is not None:
        stmt = stmt.where(SalesmanMonthlyPlan.year == year)
    stmt = stmt.order_by(SalesmanMonthlyPlan.year.desc(), SalesmanMonthlyPlan.month.desc(), SalesmanMonthlyPlan.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/salesman/monthly-plans", response_model=SalesmanMonthlyPlanOut, dependencies=[Depends(require_permission("planning", "create"))])
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


@router.delete(
    "/salesman/monthly-plans/{monthly_plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("planning", "delete"))],
)
async def delete_salesman_monthly_plan(
    monthly_plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(SalesmanMonthlyPlan, monthly_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salesman monthly plan not found")
    await db.delete(plan)
    await db.commit()


@router.post(
    "/salesman/monthly-plans/{monthly_plan_id}/assignments",
    response_model=SalesmanDailyAssignmentOut,
    dependencies=[Depends(require_permission("planning", "update"))],
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
    dependencies=[Depends(require_permission("planning", "read"))],
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


@router.delete(
    "/salesman/monthly-plans/{monthly_plan_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("planning", "delete"))],
)
async def delete_salesman_daily_assignment(
    monthly_plan_id: uuid.UUID,
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    assignment = await db.get(SalesmanDailyAssignment, assignment_id)
    if assignment is None or assignment.monthly_plan_id != monthly_plan_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salesman assignment not found")
    await db.delete(assignment)
    await db.commit()


@router.get("/delivery/monthly-plans", response_model=list[DeliveryMonthlyPlanOut], dependencies=[Depends(require_permission("planning", "read"))])
async def list_delivery_monthly_plans(
    month: int | None = None,
    year: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DeliveryMonthlyPlan)
    if month is not None:
        stmt = stmt.where(DeliveryMonthlyPlan.month == month)
    if year is not None:
        stmt = stmt.where(DeliveryMonthlyPlan.year == year)
    stmt = stmt.order_by(DeliveryMonthlyPlan.year.desc(), DeliveryMonthlyPlan.month.desc(), DeliveryMonthlyPlan.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/delivery/monthly-plans", response_model=DeliveryMonthlyPlanOut, dependencies=[Depends(require_permission("planning", "create"))])
async def create_delivery_monthly_plan(payload: DeliveryMonthlyPlanCreate, db: AsyncSession = Depends(get_db)):
    plan = DeliveryMonthlyPlan(**payload.model_dump())
    db.add(plan)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Plan name already exists") from exc
    await db.refresh(plan)
    return plan


@router.delete(
    "/delivery/monthly-plans/{monthly_plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("planning", "delete"))],
)
async def delete_delivery_monthly_plan(
    monthly_plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    plan = await db.get(DeliveryMonthlyPlan, monthly_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery monthly plan not found")
    await db.delete(plan)
    await db.commit()


@router.post(
    "/delivery/monthly-plans/{monthly_plan_id}/assignments",
    response_model=DeliveryDailyAssignmentOut,
    dependencies=[Depends(require_permission("planning", "update"))],
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
        "driver_id": {EmployeeRole.DELIVERY_EMPLOYEE, EmployeeRole.DRIVER},
        "helper_id": {EmployeeRole.DELIVERY_EMPLOYEE, EmployeeRole.IN_VEHICLE_HELPER},
        "bill_manager_id": {EmployeeRole.DELIVERY_EMPLOYEE, EmployeeRole.BILL_MANAGER},
        "loader_id": {EmployeeRole.DELIVERY_EMPLOYEE, EmployeeRole.LOADER},
    }
    for field_name, allowed_roles in role_map.items():
        employee_id = getattr(payload, field_name)
        if employee_id is None:
            continue
        employee = await db.get(Employee, employee_id)
        if employee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Employee not found: {field_name}")
        if employee.role not in allowed_roles:
            allowed_text = ", ".join(sorted(role.value for role in allowed_roles))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must have one of roles: {allowed_text}",
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
    dependencies=[Depends(require_permission("planning", "read"))],
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


@router.get(
    "/delivery/assignments/by-day",
    response_model=list[DeliveryDailyAssignmentSummary],
    dependencies=[Depends(require_permission("planning", "read"))],
)
async def list_delivery_assignments_by_day(
    duty_date: date,
    db: AsyncSession = Depends(get_db),
):
    driver = aliased(Employee)
    helper = aliased(Employee)
    bill_manager = aliased(Employee)
    loader = aliased(Employee)
    rows = (
        await db.execute(
            select(
                DeliveryDailyAssignment,
                Vehicle.vehicle_name,
                Vehicle.registration_no,
                Vehicle.capacity_kg,
                driver.full_name.label("driver_name"),
                helper.full_name.label("helper_name"),
                bill_manager.full_name.label("bill_manager_name"),
                loader.full_name.label("loader_name"),
            )
            .outerjoin(Vehicle, Vehicle.id == DeliveryDailyAssignment.vehicle_id)
            .outerjoin(driver, driver.id == DeliveryDailyAssignment.driver_id)
            .outerjoin(helper, helper.id == DeliveryDailyAssignment.helper_id)
            .outerjoin(bill_manager, bill_manager.id == DeliveryDailyAssignment.bill_manager_id)
            .outerjoin(loader, loader.id == DeliveryDailyAssignment.loader_id)
            .where(DeliveryDailyAssignment.duty_date == duty_date)
            .order_by(DeliveryDailyAssignment.created_at.asc())
        )
    ).all()
    items: list[DeliveryDailyAssignmentSummary] = []
    for assignment, vehicle_name, registration_no, capacity_kg, driver_name, helper_name, bill_manager_name, loader_name in rows:
        items.append(
            DeliveryDailyAssignmentSummary(
                id=assignment.id,
                monthly_plan_id=assignment.monthly_plan_id,
                duty_date=assignment.duty_date,
                vehicle_id=assignment.vehicle_id,
                vehicle_name=vehicle_name,
                registration_no=registration_no,
                capacity_kg=float(capacity_kg) if capacity_kg is not None else None,
                driver_id=assignment.driver_id,
                driver_name=driver_name,
                helper_id=assignment.helper_id,
                helper_name=helper_name,
                bill_manager_id=assignment.bill_manager_id,
                bill_manager_name=bill_manager_name,
                loader_id=assignment.loader_id,
                loader_name=loader_name,
            )
        )
    return items


@router.delete(
    "/delivery/monthly-plans/{monthly_plan_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("planning", "delete"))],
)
async def delete_delivery_daily_assignment(
    monthly_plan_id: uuid.UUID,
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    assignment = await db.get(DeliveryDailyAssignment, assignment_id)
    if assignment is None or assignment.monthly_plan_id != monthly_plan_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery assignment not found")
    await db.delete(assignment)
    await db.commit()
