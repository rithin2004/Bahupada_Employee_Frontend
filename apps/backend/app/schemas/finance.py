import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PaymentCreate(BaseModel):
    customer_id: uuid.UUID
    amount: Decimal
    mode: str
    reference_type: str
    reference_id: uuid.UUID | None = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    amount: Decimal
    mode: str
    payment_mode: str | None
    reference_type: str
    reference_id: uuid.UUID | None
    payment_date: date | None


class CustomerOutstandingResponse(BaseModel):
    customer_id: uuid.UUID
    opening_balance: Decimal
    billed_total: Decimal
    debit_note_total: Decimal
    credit_note_total: Decimal
    paid_total: Decimal
    outstanding: Decimal


class TrialBalanceResponse(BaseModel):
    total_debit: Decimal
    total_credit: Decimal


class LedgerAccountBalance(BaseModel):
    account_name: str
    total_debit: Decimal
    total_credit: Decimal
    net: Decimal


class LedgerSummaryResponse(BaseModel):
    items: list[LedgerAccountBalance]


class CustomerStatementEntry(BaseModel):
    id: uuid.UUID
    date: date | None
    amount: Decimal


class CustomerStatementResponse(BaseModel):
    customer_id: uuid.UUID
    invoices: list[CustomerStatementEntry]
    payments: list[CustomerStatementEntry]


class CustomerAgingResponse(BaseModel):
    customer_id: uuid.UUID
    bucket_0_30: Decimal
    bucket_31_60: Decimal
    bucket_61_90: Decimal
    bucket_91_plus: Decimal


class JournalLineCreate(BaseModel):
    line_no: int
    account_id: uuid.UUID | None = None
    account_name: str
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")


class JournalEntryCreate(BaseModel):
    entry_date: date
    reference_type: str | None = None
    reference_id: uuid.UUID | None = None
    note: str | None = None
    status: str = "POSTED"
    lines: list[JournalLineCreate]


class JournalLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    journal_entry_id: uuid.UUID
    line_no: int
    account_id: uuid.UUID | None
    account_name: str
    debit: Decimal
    credit: Decimal


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entry_date: date
    reference_type: str | None
    reference_id: uuid.UUID | None
    note: str | None
    status: str


class PaymentAllocationCreate(BaseModel):
    sales_final_invoice_id: uuid.UUID
    allocated_amount: Decimal


class PaymentAllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payment_id: uuid.UUID
    sales_final_invoice_id: uuid.UUID
    allocated_amount: Decimal


class PartyLedgerAccountSummary(BaseModel):
    account_id: uuid.UUID
    party_type: str
    party_id: uuid.UUID
    party_name: str
    total_debit: Decimal
    total_credit: Decimal
    balance: Decimal
    balance_side: str


class PartyLedgerAccountsResponse(BaseModel):
    items: list[PartyLedgerAccountSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


class PartyLedgerStatementEntry(BaseModel):
    entry_id: uuid.UUID
    entry_date: date
    description: str
    reference_type: str
    reference_id: uuid.UUID | None
    admin_debit: Decimal
    admin_credit: Decimal
    counterparty_debit: Decimal
    counterparty_credit: Decimal
    running_balance: Decimal
    balance_side: str


class PartyLedgerStatementResponse(BaseModel):
    account_id: uuid.UUID
    party_type: str
    party_id: uuid.UUID
    party_name: str
    items: list[PartyLedgerStatementEntry]
    total_debit: Decimal
    total_credit: Decimal
    balance: Decimal
    balance_side: str


class PartyLedgerPaymentCreate(BaseModel):
    party_type: str
    party_id: uuid.UUID
    amount: Decimal
    direction: str
    payment_mode: str | None = None
    payment_date: date | None = None
    reference_no: str | None = None
    note: str | None = None
