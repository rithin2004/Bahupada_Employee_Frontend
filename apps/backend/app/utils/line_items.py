"""Helpers for validating multi-line document payloads."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from fastapi import HTTPException, status


def raise_if_duplicate_line_products(items: Iterable[object]) -> None:
    """Each line must use a distinct product_id (quantities belong on a single line)."""
    seen: set[uuid.UUID] = set()
    for item in items:
        pid = getattr(item, "product_id", None)
        if pid is None:
            continue
        if not isinstance(pid, uuid.UUID):
            pid = uuid.UUID(str(pid))
        if pid in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate product lines are not allowed; use one line per product and merge quantities.",
            )
        seen.add(pid)
