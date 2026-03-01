import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AttendanceLog, Employee, EmployeeRole, PackingTask, SalesOrder

PACKING_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"ASSIGNED", "IN_PROGRESS", "READY_TO_DISPATCH"},
    "ASSIGNED": {"IN_PROGRESS", "READY_TO_DISPATCH"},
    "IN_PROGRESS": {"READY_TO_DISPATCH"},
    "READY_TO_DISPATCH": set(),
}


async def auto_assign_packing(
    session: AsyncSession, warehouse_id: uuid.UUID, attendance_date: date
) -> dict[str, int]:
    attendance_res = await session.execute(
        select(AttendanceLog).where(
            AttendanceLog.attendance_date == attendance_date,
            AttendanceLog.is_active_for_shift.is_(True),
        )
    )
    active_employee_ids = [row.employee_id for row in attendance_res.scalars().all()]

    if not active_employee_ids:
        return {"tasks_assigned": 0}

    emp_res = await session.execute(
        select(Employee).where(
            Employee.id.in_(active_employee_ids),
            Employee.warehouse_id == warehouse_id,
        )
    )
    employees = emp_res.scalars().all()

    packers = [e for e in employees if e.role == EmployeeRole.PACKER]
    supervisors = [e for e in employees if e.role == EmployeeRole.SUPERVISOR]
    if not packers or not supervisors:
        return {"tasks_assigned": 0}

    pending_res = await session.execute(
        select(PackingTask)
        .join(SalesOrder, PackingTask.sales_order_id == SalesOrder.id)
        .where(
            PackingTask.warehouse_id == warehouse_id,
            func.upper(PackingTask.status) == "PENDING",
        )
    )
    tasks = pending_res.scalars().all()

    if not tasks:
        return {"tasks_assigned": 0}

    supervisor_groups = defaultdict(list)
    for i, packer in enumerate(packers):
        supervisor = supervisors[(i // 4) % len(supervisors)]
        supervisor_groups[supervisor.id].append(packer)

    all_packers = [p for group in supervisor_groups.values() for p in group]
    p_len = len(all_packers)
    s_ids = list(supervisor_groups.keys())

    for i, task in enumerate(tasks):
        task.assigned_packer_id = all_packers[i % p_len].id
        task.assigned_supervisor_id = s_ids[(i // 4) % len(s_ids)]
        task.status = "ASSIGNED"

    await session.commit()
    return {"tasks_assigned": len(tasks)}


def _normalize_status(value: str) -> str:
    return value.strip().upper()


async def update_packing_task_status(
    session: AsyncSession,
    task: PackingTask,
    *,
    target_status: str,
    pack_label: str | None,
    invoice_written_on_pack: bool | None,
) -> PackingTask:
    current = _normalize_status(task.status)
    target = _normalize_status(target_status)

    if current != target:
        allowed = PACKING_STATUS_TRANSITIONS.get(current)
        if allowed is None:
            raise ValueError(f"Unknown packing status '{task.status}'")
        if target not in allowed:
            raise ValueError(
                f"Invalid packing status transition: {current} -> {target}. "
                f"Allowed: {', '.join(sorted(allowed)) or 'none'}"
            )

    if target == "READY_TO_DISPATCH":
        if not (pack_label and pack_label.strip()):
            raise ValueError("pack_label is required when marking READY_TO_DISPATCH")
        task.pack_label = pack_label.strip()
        task.invoice_written_on_pack = True if invoice_written_on_pack is None else invoice_written_on_pack
    elif pack_label is not None:
        task.pack_label = pack_label

    if invoice_written_on_pack is not None:
        task.invoice_written_on_pack = invoice_written_on_pack

    task.status = target
    await session.commit()
    await session.refresh(task)
    return task
