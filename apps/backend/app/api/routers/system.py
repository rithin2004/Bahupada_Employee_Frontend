from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.schemas.system import GoLiveCheckItem, GoLiveChecksResponse

router = APIRouter()


@router.get("/go-live-checks", response_model=GoLiveChecksResponse)
async def go_live_checks(db: AsyncSession = Depends(get_db)):
    checks: list[GoLiveCheckItem] = []

    jwt_rotated = settings.jwt_secret_key != "change_me"
    checks.append(
        GoLiveCheckItem(
            name="JWT_SECRET_ROTATED",
            ok=jwt_rotated,
            detail="jwt_secret_key must not use default value",
        )
    )

    db_url_ok = "://" in settings.database_url and "localhost:5432/bahu" not in settings.database_url
    checks.append(
        GoLiveCheckItem(
            name="DATABASE_URL_CONFIGURED",
            ok=db_url_ok,
            detail="database_url should point to managed/stable DB for target environment",
        )
    )

    celery_ok = bool(settings.celery_broker_url and "amqp://" in settings.celery_broker_url)
    checks.append(
        GoLiveCheckItem(
            name="CELERY_BROKER_CONFIGURED",
            ok=celery_ok,
            detail="celery_broker_url should be configured",
        )
    )

    checks.append(
        GoLiveCheckItem(
            name="GZIP_ENABLED",
            ok=settings.gzip_enabled,
            detail="gzip middleware should be enabled",
        )
    )

    checks.append(
        GoLiveCheckItem(
            name="PAGINATION_GUARD",
            ok=settings.pagination_max_page_size <= 500,
            detail="pagination_max_page_size should stay bounded",
        )
    )

    db_connectivity = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_connectivity = False

    checks.append(
        GoLiveCheckItem(
            name="DATABASE_CONNECTIVITY",
            ok=db_connectivity,
            detail="runtime DB connectivity test",
        )
    )

    required = {"JWT_SECRET_ROTATED", "DATABASE_URL_CONFIGURED", "DATABASE_CONNECTIVITY"}
    overall_ready = all(c.ok for c in checks if c.name in required)
    return GoLiveChecksResponse(overall_ready=overall_ready, checks=checks)
