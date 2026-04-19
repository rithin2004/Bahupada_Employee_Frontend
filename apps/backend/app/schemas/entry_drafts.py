from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EntryDraftUpsert(BaseModel):
    payload: dict[str, Any] = Field(..., description="Opaque JSON from the entry workspace serializer")


class EntryDraftOut(BaseModel):
    draft_kind: str
    payload: dict[str, Any]
    updated_at: datetime
