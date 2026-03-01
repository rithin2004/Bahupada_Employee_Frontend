import os
import asyncio
import secrets
import time
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.db.base import Base
from app.db.session import get_db
from app.db.url import normalize_asyncpg_url
from app.main import app
from app.models import entities  # noqa: F401


def _read_env_file_value(key: str) -> str | None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return None
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() != key:
            continue
        value = v.strip().strip("'").strip('"')
        return value or None
    return None


def _resolve_test_database_url() -> str:
    # Priority: dedicated test DB URL, then app DB URL, then local fallback.
    return (
        os.getenv("TEST_DATABASE_URL")
        or _read_env_file_value("TEST_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or _read_env_file_value("DATABASE_URL")
        or "postgresql+asyncpg://postgres:postgres@localhost:5432/bahu"
    )


TEST_DATABASE_URL = _resolve_test_database_url()


def _db_connect_timeout_seconds() -> float:
    value = os.getenv("TEST_DB_CONNECT_TIMEOUT_SECONDS", "20").strip()
    try:
        return max(1.0, float(value))
    except ValueError:
        return 20.0


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    timeout_s = _db_connect_timeout_seconds()
    test_schema = f"test_{secrets.token_hex(6)}"
    engine = create_async_engine(
        normalize_asyncpg_url(TEST_DATABASE_URL),
        pool_pre_ping=False,
        poolclass=NullPool,
        connect_args={
            "timeout": timeout_s,
            # Isolate test DDL/data to a dedicated schema to avoid
            # lock contention with other connections using the same DB.
            "server_settings": {
                "search_path": f"{test_schema},public",
                # Fail fast instead of hanging forever on locks/slow queries.
                "lock_timeout": "5000",
                "statement_timeout": "15000",
            },
        },
    )
    try:
        conn = await asyncio.wait_for(engine.connect(), timeout=timeout_s)
        try:
            await asyncio.wait_for(
                conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{test_schema}"')),
                timeout=timeout_s,
            )
            await asyncio.wait_for(conn.execute(text("SELECT 1")), timeout=timeout_s)
        finally:
            await conn.close()
    except (SQLAlchemyError, asyncio.TimeoutError, OSError) as exc:  # pragma: no cover
        pytest.skip(
            "PostgreSQL not reachable for integration tests: "
            f"{type(exc).__name__}: {exc!r}"
        )

    t0 = time.perf_counter()
    print(f"[tests] create_all start (schema={test_schema})", flush=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print(f"[tests] create_all done in {time.perf_counter()-t0:.3f}s", flush=True)

    yield engine

    async with engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{test_schema}" CASCADE'))
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_local = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_local() as session:
        tables = [t.name for t in Base.metadata.sorted_tables]
        if tables:
            quoted = ", ".join(f'"{name}"' for name in tables)
            t0 = time.perf_counter()
            print(f"[tests] truncate start ({len(tables)} tables)", flush=True)
            await session.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
            await session.commit()
            print(f"[tests] truncate done in {time.perf_counter()-t0:.3f}s", flush=True)
        yield session


@pytest_asyncio.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
