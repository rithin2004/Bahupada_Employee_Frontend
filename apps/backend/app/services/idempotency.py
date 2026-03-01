import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import IdempotencyKey


def _request_hash(payload: Any) -> str:
    serialized = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


async def idempotency_precheck(
    db: AsyncSession,
    key: str | None,
    endpoint: str,
    payload: Any,
) -> tuple[int | None, dict[str, Any] | None, str | None]:
    if not key:
        return None, None, None

    req_hash = _request_hash(payload)

    existing = (
        await db.execute(select(IdempotencyKey).where(IdempotencyKey.key == key, IdempotencyKey.endpoint == endpoint))
    ).scalar_one_or_none()

    if existing is not None:
        if existing.request_hash != req_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key already used with a different request payload",
            )
        if existing.response_body is not None:
            return existing.response_code or 200, json.loads(existing.response_body), req_hash
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already in progress")

    db.add(
        IdempotencyKey(
            key=key,
            endpoint=endpoint,
            request_hash=req_hash,
            created_at=datetime.now(timezone.utc),
        )
    )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        winner = (
            await db.execute(
                select(IdempotencyKey).where(IdempotencyKey.key == key, IdempotencyKey.endpoint == endpoint)
            )
        ).scalar_one_or_none()
        if winner and winner.response_body is not None:
            return winner.response_code or 200, json.loads(winner.response_body), req_hash
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Concurrent duplicate request")

    return None, None, req_hash


async def idempotency_store_response(
    db: AsyncSession,
    key: str | None,
    endpoint: str,
    request_hash: str | None,
    response_code: int,
    response_body: dict[str, Any],
) -> None:
    if not key or not request_hash:
        return

    row = (
        await db.execute(select(IdempotencyKey).where(IdempotencyKey.key == key, IdempotencyKey.endpoint == endpoint))
    ).scalar_one_or_none()
    if row is None:
        row = IdempotencyKey(
            key=key,
            endpoint=endpoint,
            request_hash=request_hash,
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)

    row.response_code = response_code
    row.response_body = json.dumps(response_body, default=str)
    await db.commit()
