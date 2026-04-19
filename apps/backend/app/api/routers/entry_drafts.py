"""Persisted drafts for purchase/sales bill & challan entry forms."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.auth import require_admin_portal
from app.db.session import get_db
from app.models.entities import EntryDraft
from app.schemas.auth import AuthUserInfo
from app.schemas.entry_drafts import EntryDraftOut, EntryDraftUpsert

router = APIRouter()

ALLOWED_DRAFT_KINDS = frozenset(
    {
        "purchase_bill",
        "purchase_challan",
        "sales_bill",
        "sales_challan",
    }
)


def _parse_kind(draft_kind: str) -> str:
    k = (draft_kind or "").strip().lower()
    if k not in ALLOWED_DRAFT_KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid draft kind. Expected one of: {', '.join(sorted(ALLOWED_DRAFT_KINDS))}",
        )
    return k


@router.get("/{draft_kind}", response_model=EntryDraftOut)
async def get_entry_draft(
    draft_kind: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_admin_portal),
):
    kind = _parse_kind(draft_kind)
    uid = uuid.UUID(auth.user_id)
    res = await db.execute(select(EntryDraft).where(EntryDraft.user_id == uid, EntryDraft.draft_kind == kind))
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No draft saved for this entry type")
    return EntryDraftOut(draft_kind=row.draft_kind, payload=row.payload, updated_at=row.updated_at)


@router.put("/{draft_kind}")
async def upsert_entry_draft(
    draft_kind: str,
    body: EntryDraftUpsert,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_admin_portal),
):
    kind = _parse_kind(draft_kind)
    uid = uuid.UUID(auth.user_id)
    now = datetime.now(timezone.utc)
    res = await db.execute(select(EntryDraft).where(EntryDraft.user_id == uid, EntryDraft.draft_kind == kind))
    row = res.scalar_one_or_none()
    if row is None:
        db.add(EntryDraft(user_id=uid, draft_kind=kind, payload=body.payload, updated_at=now))
    else:
        row.payload = body.payload
        row.updated_at = now
    await db.commit()
    return {"ok": True, "updated_at": now.isoformat()}


@router.delete("/{draft_kind}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry_draft(
    draft_kind: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_admin_portal),
):
    kind = _parse_kind(draft_kind)
    uid = uuid.UUID(auth.user_id)
    await db.execute(delete(EntryDraft).where(EntryDraft.user_id == uid, EntryDraft.draft_kind == kind))
    await db.commit()
    return None
