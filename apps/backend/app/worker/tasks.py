import asyncio
import uuid
from datetime import date

from app.db.session import SessionLocal
from app.services.delivery import optimize_delivery_run
from app.worker.celery_app import celery_app


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def optimize_delivery_route_task(self, warehouse_id: str, run_date: str, sales_order_ids: list[str]):
    async def _run() -> dict[str, str | bool]:
        async with SessionLocal() as session:
            run = await optimize_delivery_run(
                session=session,
                warehouse_id=uuid.UUID(warehouse_id),
                run_date=date.fromisoformat(run_date),
                sales_order_ids=[uuid.UUID(v) for v in sales_order_ids],
            )
            return {"delivery_run_id": str(run.id), "optimized": run.optimized}

    return asyncio.run(_run())
