import uuid

from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import AttendanceLog, PackingTask, SalesOrder
from app.schemas.packing import (
    AttendanceMark,
    AttendanceOut,
    AutoAssignmentRequest,
    PackingAutoAssignResponse,
    PackingTaskOut,
    PackingTaskStatusUpdate,
    ReadyToDispatchDashboardResponse,
)
from app.services.packing import auto_assign_packing, update_packing_task_status

router = APIRouter()


@router.post("/attendance", response_model=AttendanceOut)
async def mark_attendance(payload: AttendanceMark, db: AsyncSession = Depends(get_db)):
    row = AttendanceLog(**payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/assignments/auto", response_model=PackingAutoAssignResponse)
async def auto_assign(payload: AutoAssignmentRequest, db: AsyncSession = Depends(get_db)):
    return await auto_assign_packing(db, payload.warehouse_id, payload.attendance_date)


@router.patch("/tasks/{task_id}/status", response_model=PackingTaskOut)
async def update_task_status(task_id: uuid.UUID, payload: PackingTaskStatusUpdate, db: AsyncSession = Depends(get_db)):
    task = await db.get(PackingTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    try:
        return await update_packing_task_status(
            db,
            task,
            target_status=payload.status,
            pack_label=payload.pack_label,
            invoice_written_on_pack=payload.invoice_written_on_pack,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/dashboard/ready-to-dispatch", response_model=ReadyToDispatchDashboardResponse)
async def ready_to_dispatch_dashboard(
    warehouse_id: uuid.UUID | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PackingTask, SalesOrder)
        .join(SalesOrder, PackingTask.sales_order_id == SalesOrder.id)
        .where(func.upper(PackingTask.status) == "READY_TO_DISPATCH")
        .order_by(PackingTask.created_at.asc())
        .limit(limit)
    )
    if warehouse_id is not None:
        stmt = stmt.where(PackingTask.warehouse_id == warehouse_id)

    rows = (await db.execute(stmt)).all()
    return {
        "count": len(rows),
        "items": [
            {
                "packing_task_id": str(task.id),
                "sales_order_id": str(order.id),
                "warehouse_id": str(task.warehouse_id),
                "status": task.status,
                "pack_label": task.pack_label,
                "invoice_written_on_pack": task.invoice_written_on_pack,
            }
            for task, order in rows
        ],
    }
