import uuid

from fastapi import APIRouter, Depends, Header
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.finance import (
    CustomerAgingResponse,
    CustomerOutstandingResponse,
    CustomerStatementResponse,
    JournalEntryCreate,
    JournalEntryOut,
    JournalLineOut,
    LedgerSummaryResponse,
    PartyLedgerAccountsResponse,
    PartyLedgerPaymentCreate,
    PartyLedgerStatementResponse,
    PaymentAllocationCreate,
    PaymentAllocationOut,
    PaymentCreate,
    PaymentOut,
    TrialBalanceResponse,
)
from app.services.finance import (
    allocate_payment_to_invoice,
    create_journal_entry,
    customer_aging,
    customer_outstanding_breakdown,
    customer_statement,
    get_party_ledger_statement,
    ledger_summary,
    list_party_ledger_accounts,
    record_party_payment,
    record_payment,
    trial_balance,
)
from app.services.idempotency import idempotency_precheck, idempotency_store_response
from app.models.entities import PartyType, PaymentFlowDirection

router = APIRouter()


@router.post("/payments", response_model=PaymentOut)
async def create_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
):
    replay_code, replay_body, req_hash = await idempotency_precheck(
        db, idempotency_key, "finance:create_payment", payload.model_dump(mode="json")
    )
    if replay_body is not None:
        return replay_body

    try:
        payment = await record_payment(
            db,
            payload.customer_id,
            payload.amount,
            payload.mode,
            payload.reference_type,
            payload.reference_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    response = jsonable_encoder(payment)
    await idempotency_store_response(
        db, idempotency_key, "finance:create_payment", req_hash, replay_code or 201, response
    )
    return response


@router.get("/customers/{customer_id}/outstanding", response_model=CustomerOutstandingResponse)
async def customer_outstanding(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    try:
        breakdown = await customer_outstanding_breakdown(db, customer_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {"customer_id": customer_id, **breakdown}


@router.get("/ledger/trial-balance", response_model=TrialBalanceResponse)
async def get_trial_balance(db: AsyncSession = Depends(get_db)):
    return await trial_balance(db)


@router.get("/ledger/summary", response_model=LedgerSummaryResponse)
async def get_ledger_summary(db: AsyncSession = Depends(get_db)):
    return {"items": await ledger_summary(db)}


@router.get("/customers/{customer_id}/statement", response_model=CustomerStatementResponse)
async def get_customer_statement(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    data = await customer_statement(db, customer_id)
    return {"customer_id": customer_id, **data}


@router.get("/customers/{customer_id}/aging", response_model=CustomerAgingResponse)
async def get_customer_aging(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    buckets = await customer_aging(db, customer_id)
    return {
        "customer_id": customer_id,
        "bucket_0_30": buckets["0_30"],
        "bucket_31_60": buckets["31_60"],
        "bucket_61_90": buckets["61_90"],
        "bucket_91_plus": buckets["91_plus"],
    }


@router.post("/journal-entries", response_model=JournalEntryOut)
async def post_journal_entry(payload: JournalEntryCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await create_journal_entry(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/journal-entries/{journal_entry_id}/lines", response_model=list[JournalLineOut])
async def get_journal_entry_lines(journal_entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select

    from app.models.entities import JournalLine

    return (
        await db.execute(
            select(JournalLine).where(JournalLine.journal_entry_id == journal_entry_id).order_by(JournalLine.line_no.asc())
        )
    ).scalars().all()


@router.post("/payments/{payment_id}/allocations", response_model=PaymentAllocationOut)
async def post_payment_allocation(
    payment_id: uuid.UUID,
    payload: PaymentAllocationCreate,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await allocate_payment_to_invoice(
            db,
            payment_id=payment_id,
            sales_final_invoice_id=payload.sales_final_invoice_id,
            allocated_amount=payload.allocated_amount,
        )
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get("/payments/{payment_id}/allocations", response_model=list[PaymentAllocationOut])
async def list_payment_allocations(payment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select

    from app.models.entities import PaymentAllocation

    return (
        await db.execute(select(PaymentAllocation).where(PaymentAllocation.payment_id == payment_id))
    ).scalars().all()


@router.get("/credit-notes")
async def list_credit_notes(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select

    from app.models.entities import CreditNote

    return (await db.execute(select(CreditNote).order_by(CreditNote.created_at.desc()))).scalars().all()


@router.get("/debit-notes")
async def list_debit_notes(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select

    from app.models.entities import DebitNote

    return (await db.execute(select(DebitNote).order_by(DebitNote.created_at.desc()))).scalars().all()


@router.get("/party-ledger/accounts", response_model=PartyLedgerAccountsResponse)
async def get_party_ledger_accounts(
    party_type: str,
    page: int = 1,
    page_size: int = 50,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        resolved_party_type = PartyType(party_type.upper())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid party_type") from exc
    return await list_party_ledger_accounts(
        db,
        party_type=resolved_party_type,
        page=page,
        page_size=page_size,
        search=search,
    )


@router.get("/party-ledger/{party_type}/{party_id}", response_model=PartyLedgerStatementResponse)
async def get_party_statement(
    party_type: str,
    party_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    try:
        resolved_party_type = PartyType(party_type.upper())
        return await get_party_ledger_statement(db, party_type=resolved_party_type, party_id=party_id)
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.post("/party-ledger/payments")
async def create_party_ledger_payment(
    payload: PartyLedgerPaymentCreate,
    db: AsyncSession = Depends(get_db),
):
    try:
        resolved_party_type = PartyType(payload.party_type.upper())
        resolved_direction = PaymentFlowDirection(payload.direction.upper())
        payment = await record_party_payment(
            db,
            party_type=resolved_party_type,
            party_id=payload.party_id,
            amount=payload.amount,
            direction=resolved_direction,
            payment_mode=payload.payment_mode,
            payment_date_value=payload.payment_date,
            reference_no=payload.reference_no,
            note=payload.note,
        )
        return jsonable_encoder(payment)
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc
