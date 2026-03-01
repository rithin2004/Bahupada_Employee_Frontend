from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from celery.result import AsyncResult
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import (
    DeliveryAssignment,
    DeliveryMonthlyPlan,
    DeliveryRun,
    DeliveryRunStop,
    Employee,
    EmployeeRole,
    PodEvent,
)
from app.schemas.delivery import (
    DeliveryAssignTeamRequest,
    DeliveryAssignmentOut,
    DeliveryMonthlyPlanCreate,
    DeliveryMonthlyPlanOut,
    DeliveryRunFromReadyRequest,
    DeliveryRunOptimizeRequest,
    DeliveryRunOptimizeResponse,
    DeliveryRunSummaryResponse,
    DeliveryTaskStatusResponse,
    PodCaptureRequest,
    PodEventOut,
    ReadyToDispatchResponse,
)
from app.services.delivery import optimize_delivery_run, optimize_delivery_run_from_ready_tasks, ready_to_dispatch_tasks
from app.worker.celery_app import celery_app
from app.worker.tasks import optimize_delivery_route_task

router = APIRouter()


@router.post("/plans/monthly", response_model=DeliveryMonthlyPlanOut)
async def create_monthly_plan(payload: DeliveryMonthlyPlanCreate, db: AsyncSession = Depends(get_db)):
    plan = DeliveryMonthlyPlan(**payload.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.post("/runs/optimize-route", response_model=DeliveryRunOptimizeResponse)
async def optimize_route(payload: DeliveryRunOptimizeRequest, db: AsyncSession = Depends(get_db)):
    try:
        run = await optimize_delivery_run(db, payload.warehouse_id, payload.run_date, payload.sales_order_ids)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"delivery_run_id": str(run.id), "optimized": run.optimized}


@router.get("/runs/ready-to-dispatch", response_model=ReadyToDispatchResponse)
async def list_ready_to_dispatch(warehouse_id: str, db: AsyncSession = Depends(get_db)):
    try:
        import uuid

        parsed_warehouse_id = uuid.UUID(warehouse_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid warehouse_id") from exc
    tasks = await ready_to_dispatch_tasks(db, parsed_warehouse_id)
    return {"items": tasks, "count": len(tasks)}


@router.post("/runs/from-ready", response_model=DeliveryRunOptimizeResponse)
async def optimize_route_from_ready(payload: DeliveryRunFromReadyRequest, db: AsyncSession = Depends(get_db)):
    try:
        run = await optimize_delivery_run_from_ready_tasks(
            db,
            payload.warehouse_id,
            payload.run_date,
            payload.packing_task_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"delivery_run_id": str(run.id), "optimized": run.optimized}


@router.post("/runs/optimize-route/async")
async def optimize_route_async(payload: DeliveryRunOptimizeRequest):
    task = optimize_delivery_route_task.delay(
        warehouse_id=str(payload.warehouse_id),
        run_date=str(payload.run_date),
        sales_order_ids=[str(v) for v in payload.sales_order_ids],
    )
    return {"task_id": task.id, "status": "PROCESSING"}


@router.get("/tasks/{task_id}", response_model=DeliveryTaskStatusResponse)
async def get_delivery_task_status(task_id: str):
    task = AsyncResult(task_id, app=celery_app)
    if task.state in {"PENDING", "STARTED", "RETRY"}:
        return {"task_id": task.id, "status": "PROCESSING"}
    if task.state == "SUCCESS":
        return {"task_id": task.id, "status": "COMPLETED", "result": task.result}
    return {"task_id": task.id, "status": "FAILED", "error": str(task.info)}


@router.post("/runs/assign-team", response_model=DeliveryAssignmentOut)
async def assign_team(payload: DeliveryAssignTeamRequest, db: AsyncSession = Depends(get_db)):
    role_map = {
        "driver_id": EmployeeRole.DRIVER,
        "helper_id": EmployeeRole.IN_VEHICLE_HELPER,
        "bill_manager_id": EmployeeRole.BILL_MANAGER,
        "loader_id": EmployeeRole.LOADER,
    }
    for field_name, required_role in role_map.items():
        employee_id = getattr(payload, field_name)
        employee = await db.get(Employee, employee_id)
        if employee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Employee not found: {field_name}")
        if employee.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must have role {required_role.value}",
            )

    assignment = DeliveryAssignment(**payload.model_dump())
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.post("/stops/pod", response_model=PodEventOut)
async def capture_pod(payload: PodCaptureRequest, db: AsyncSession = Depends(get_db)):
    event = PodEvent(**payload.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/runs/{delivery_run_id}/summary", response_model=DeliveryRunSummaryResponse)
async def delivery_run_summary(delivery_run_id: str, db: AsyncSession = Depends(get_db)):
    try:
        import uuid

        parsed_id = uuid.UUID(delivery_run_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid delivery_run_id") from exc

    run = await db.get(DeliveryRun, parsed_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery run not found")

    total_stops = (
        await db.execute(select(func.count(DeliveryRunStop.id)).where(DeliveryRunStop.delivery_run_id == run.id))
    ).scalar_one()
    delivered_stops = (
        await db.execute(
            select(func.count(func.distinct(PodEvent.delivery_run_stop_id)))
            .join(DeliveryRunStop, DeliveryRunStop.id == PodEvent.delivery_run_stop_id)
            .where(
                DeliveryRunStop.delivery_run_id == run.id,
                func.upper(PodEvent.status) == "DELIVERED",
            )
        )
    ).scalar_one()
    assignment_count = (
        await db.execute(select(func.count(DeliveryAssignment.id)).where(DeliveryAssignment.delivery_run_id == run.id))
    ).scalar_one()

    return {
        "delivery_run_id": str(run.id),
        "warehouse_id": str(run.warehouse_id),
        "run_date": run.run_date.isoformat(),
        "optimized": run.optimized,
        "total_stops": int(total_stops or 0),
        "delivered_stops": int(delivered_stops or 0),
        "pending_stops": int((total_stops or 0) - (delivered_stops or 0)),
        "team_assigned": assignment_count > 0,
    }
