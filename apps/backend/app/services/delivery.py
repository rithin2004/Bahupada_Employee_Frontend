import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import DeliveryRun, DeliveryRunStop, PackingTask, SalesOrder


async def optimize_delivery_run(
    session: AsyncSession,
    warehouse_id: uuid.UUID,
    run_date: date,
    sales_order_ids: list[uuid.UUID],
) -> DeliveryRun:
    if not sales_order_ids:
        raise ValueError("At least one sales order is required to optimize route")

    order_ids = list(dict.fromkeys(sales_order_ids))
    orders_res = await session.execute(select(SalesOrder).where(SalesOrder.id.in_(order_ids)))
    orders = orders_res.scalars().all()
    if len(orders) != len(order_ids):
        raise ValueError("One or more sales orders were not found")
    if any(o.warehouse_id != warehouse_id for o in orders):
        raise ValueError("All sales orders must belong to the selected warehouse")

    run = DeliveryRun(warehouse_id=warehouse_id, run_date=run_date, optimized=True)
    session.add(run)
    await session.flush()

    ordered_ids = sorted(str(i) for i in order_ids)
    for idx, order_id in enumerate(ordered_ids, start=1):
        session.add(
            DeliveryRunStop(
                delivery_run_id=run.id,
                sales_order_id=uuid.UUID(order_id),
                stop_sequence=idx,
                reverse_load_sequence=(len(ordered_ids) - idx + 1),
            )
        )

    await session.commit()
    await session.refresh(run)
    return run


async def ready_to_dispatch_tasks(session: AsyncSession, warehouse_id: uuid.UUID):
    rows_res = await session.execute(
        select(PackingTask, SalesOrder)
        .join(SalesOrder, PackingTask.sales_order_id == SalesOrder.id)
        .where(
            PackingTask.warehouse_id == warehouse_id,
            func.upper(PackingTask.status) == "READY_TO_DISPATCH",
        )
        .order_by(PackingTask.created_at.asc())
    )
    rows = rows_res.all()
    return [
        {
            "packing_task_id": str(task.id),
            "sales_order_id": str(order.id),
            "pack_label": task.pack_label,
        }
        for task, order in rows
    ]


async def optimize_delivery_run_from_ready_tasks(
    session: AsyncSession,
    warehouse_id: uuid.UUID,
    run_date: date,
    packing_task_ids: list[uuid.UUID],
) -> DeliveryRun:
    if not packing_task_ids:
        raise ValueError("At least one packing task is required")

    task_ids = list(dict.fromkeys(packing_task_ids))
    rows_res = await session.execute(
        select(PackingTask, SalesOrder)
        .join(SalesOrder, PackingTask.sales_order_id == SalesOrder.id)
        .where(PackingTask.id.in_(task_ids))
    )
    rows = rows_res.all()
    if len(rows) != len(task_ids):
        raise ValueError("One or more packing tasks were not found")

    sales_order_ids: list[uuid.UUID] = []
    for task, order in rows:
        if task.warehouse_id != warehouse_id:
            raise ValueError("All packing tasks must belong to the selected warehouse")
        if task.status.upper() != "READY_TO_DISPATCH":
            raise ValueError("All packing tasks must be READY_TO_DISPATCH")
        sales_order_ids.append(order.id)

    return await optimize_delivery_run(session, warehouse_id, run_date, sales_order_ids)
