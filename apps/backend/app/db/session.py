from collections.abc import AsyncGenerator
import logging
import time

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.url import normalize_asyncpg_url

engine = create_async_engine(
    normalize_asyncpg_url(settings.database_url),
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout_seconds,
    pool_recycle=settings.db_pool_recycle_seconds,
)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

logger = logging.getLogger("uvicorn.error")


def _format_sql(statement: str) -> str:
    compact = " ".join(statement.split())
    max_len = settings.db_log_sql_max_length
    if len(compact) <= max_len:
        return compact
    return f"{compact[:max_len]}..."


if settings.db_log_sql_timings:
    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        starts = conn.info.setdefault("query_start_time", [])
        starts.append(time.perf_counter())


    @event.listens_for(engine.sync_engine, "after_cursor_execute")
    def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        starts = conn.info.get("query_start_time", [])
        start = starts.pop() if starts else time.perf_counter()
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "[db] %.1fms rows=%s %s",
            duration_ms,
            cursor.rowcount,
            _format_sql(statement),
        )


    @event.listens_for(engine.sync_engine, "handle_error")
    def _handle_error(context):
        conn = context.connection
        starts = conn.info.get("query_start_time", []) if conn is not None else []
        start = starts.pop() if starts else time.perf_counter()
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "[db:error] %.1fms %s",
            duration_ms,
            _format_sql(context.statement or ""),
        )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
