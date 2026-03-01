from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "bahu_erp_tasks",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_default_queue=settings.celery_task_default_queue,
    task_acks_late=settings.celery_task_acks_late,
    worker_prefetch_multiplier=settings.celery_worker_prefetch_multiplier,
    task_time_limit=settings.celery_task_time_limit_seconds,
    task_queues=(
        Queue(settings.celery_task_default_queue),
        Queue(settings.celery_task_delivery_queue),
        Queue(settings.celery_task_report_queue),
    ),
    task_routes={
        "app.worker.tasks.optimize_delivery_route_task": {"queue": settings.celery_task_delivery_queue},
    },
)
