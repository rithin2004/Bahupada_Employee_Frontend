from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    AccountCategory,
    CreditNote,
    Customer,
    DebitNote,
    JournalEntry,
    JournalLine,
    LedgerEntry,
    PartyLedgerAccount,
    PartyLedgerEntry,
    PartyLedgerEntryKind,
    PartyLedgerPayment,
    PartyType,
    PaymentFlowDirection,
    Payment,
    PaymentAllocation,
    PurchaseBill,
    PurchaseBillItem,
    SalesFinalInvoice,
    SalesOrder,
    Vendor,
    VoucherStatus,
)


async def record_payment(
    session: AsyncSession,
    customer_id,
    amount: Decimal,
    mode: str,
    reference_type: str,
    reference_id,
) -> Payment:
    if amount <= 0:
        raise ValueError("Payment amount must be greater than zero")

    payment = Payment(
        customer_id=customer_id,
        amount=amount,
        mode=mode,
        payment_mode=mode,
        reference_type=reference_type,
        reference_id=reference_id,
        payment_date=date.today(),
    )
    session.add(payment)

    session.add(
        LedgerEntry(
            account_name="Cash/Bank",
            debit=amount,
            credit=Decimal("0"),
            reference_type="payment",
            reference_id=payment.id,
            entry_date=date.today(),
        )
    )
    session.add(
        LedgerEntry(
            account_name="Customer Receivable",
            debit=Decimal("0"),
            credit=amount,
            reference_type="payment",
            reference_id=payment.id,
            entry_date=date.today(),
        )
    )

    await session.commit()
    await session.refresh(payment)
    return payment


async def ensure_party_ledger_account(
    session: AsyncSession,
    *,
    party_type: PartyType,
    party_id,
    party_name: str | None = None,
) -> PartyLedgerAccount:
    account = (
        await session.execute(
            select(PartyLedgerAccount).where(
                PartyLedgerAccount.party_type == party_type,
                PartyLedgerAccount.party_id == party_id,
            )
        )
    ).scalar_one_or_none()
    if account is not None:
        if party_name and account.party_name_snapshot != party_name:
            account.party_name_snapshot = party_name
        return account

    account = PartyLedgerAccount(
        party_type=party_type,
        party_id=party_id,
        party_name_snapshot=party_name,
        is_active=True,
    )
    session.add(account)
    await session.flush()
    return account


async def post_party_ledger_entry(
    session: AsyncSession,
    *,
    party_type: PartyType,
    party_id,
    party_name: str,
    entry_kind: PartyLedgerEntryKind,
    entry_date: date,
    description: str,
    reference_type: str,
    reference_id,
    admin_debit: Decimal = Decimal("0"),
    admin_credit: Decimal = Decimal("0"),
) -> PartyLedgerEntry:
    if admin_debit < 0 or admin_credit < 0:
        raise ValueError("Ledger amounts cannot be negative")
    if admin_debit == 0 and admin_credit == 0:
        raise ValueError("Either debit or credit must be positive")

    account = await ensure_party_ledger_account(
        session,
        party_type=party_type,
        party_id=party_id,
        party_name=party_name,
    )

    existing = (
        await session.execute(
            select(PartyLedgerEntry).where(
                PartyLedgerEntry.account_id == account.id,
                PartyLedgerEntry.entry_kind == entry_kind,
                PartyLedgerEntry.reference_type == reference_type,
                PartyLedgerEntry.reference_id == reference_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    row = PartyLedgerEntry(
        account_id=account.id,
        entry_kind=entry_kind,
        entry_date=entry_date,
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
        admin_debit=admin_debit,
        admin_credit=admin_credit,
    )
    session.add(row)
    await session.flush()
    return row


async def post_vendor_purchase_bill_payable(session: AsyncSession, bill: PurchaseBill) -> PartyLedgerEntry:
    vendor = await session.get(Vendor, bill.vendor_id)
    if vendor is None:
        raise ValueError("Vendor not found")

    amount = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(
                        func.coalesce(PurchaseBillItem.quantity, Decimal("0"))
                        * func.coalesce(PurchaseBillItem.unit_price, Decimal("0"))
                    ),
                    Decimal("0"),
                )
            ).where(PurchaseBillItem.purchase_bill_id == bill.id)
        )
    ).scalar_one()
    amount = Decimal(amount or Decimal("0"))
    if amount <= 0:
        raise ValueError("Purchase bill amount must be positive to post payable")

    return await post_party_ledger_entry(
        session,
        party_type=PartyType.VENDOR,
        party_id=bill.vendor_id,
        party_name=vendor.name,
        entry_kind=PartyLedgerEntryKind.PURCHASE_BILL,
        entry_date=bill.bill_date,
        description=f"Purchase Bill {bill.bill_number}",
        reference_type="purchase_bill",
        reference_id=bill.id,
        admin_debit=Decimal("0"),
        admin_credit=amount,
    )


async def post_customer_sales_invoice_receivable(session: AsyncSession, final_invoice: SalesFinalInvoice) -> PartyLedgerEntry:
    order = await session.get(SalesOrder, final_invoice.sales_order_id)
    if order is None:
        raise ValueError("Sales order not found")
    customer = await session.get(Customer, order.customer_id)
    if customer is None:
        raise ValueError("Customer not found")

    amount = Decimal(final_invoice.total_amount or Decimal("0"))
    if amount <= 0:
        raise ValueError("Sales final invoice amount must be positive to post receivable")

    return await post_party_ledger_entry(
        session,
        party_type=PartyType.CUSTOMER,
        party_id=order.customer_id,
        party_name=customer.name,
        entry_kind=PartyLedgerEntryKind.SALES_FINAL_INVOICE,
        entry_date=final_invoice.invoice_date,
        description=f"Sales Invoice {final_invoice.invoice_number}",
        reference_type="sales_final_invoice",
        reference_id=final_invoice.id,
        admin_debit=amount,
        admin_credit=Decimal("0"),
    )


async def record_party_payment(
    session: AsyncSession,
    *,
    party_type: PartyType,
    party_id,
    amount: Decimal,
    direction: PaymentFlowDirection,
    payment_mode: str | None = None,
    payment_date_value: date | None = None,
    reference_no: str | None = None,
    note: str | None = None,
) -> PartyLedgerPayment:
    if amount <= 0:
        raise ValueError("Payment amount must be greater than zero")

    if party_type == PartyType.CUSTOMER:
        party = await session.get(Customer, party_id)
    else:
        party = await session.get(Vendor, party_id)
    if party is None:
        raise ValueError(f"{party_type.value.title()} not found")

    account = await ensure_party_ledger_account(
        session,
        party_type=party_type,
        party_id=party_id,
        party_name=party.name,
    )

    payment_row = PartyLedgerPayment(
        account_id=account.id,
        direction=direction,
        amount=amount,
        payment_mode=payment_mode,
        payment_date=payment_date_value or date.today(),
        reference_no=reference_no,
        note=note,
    )
    session.add(payment_row)
    await session.flush()

    if party_type == PartyType.VENDOR:
        admin_debit = amount if direction == PaymentFlowDirection.OUTGOING else Decimal("0")
        admin_credit = amount if direction == PaymentFlowDirection.INCOMING else Decimal("0")
    else:
        admin_debit = amount if direction == PaymentFlowDirection.OUTGOING else Decimal("0")
        admin_credit = amount if direction == PaymentFlowDirection.INCOMING else Decimal("0")

    description_prefix = "Payment" if direction == PaymentFlowDirection.OUTGOING else "Receipt"
    description = f"{description_prefix}{f' {reference_no}' if reference_no else ''}"
    if note:
        description = f"{description} - {note}"

    await post_party_ledger_entry(
        session,
        party_type=party_type,
        party_id=party_id,
        party_name=party.name,
        entry_kind=PartyLedgerEntryKind.PAYMENT,
        entry_date=payment_row.payment_date,
        description=description,
        reference_type="party_ledger_payment",
        reference_id=payment_row.id,
        admin_debit=admin_debit,
        admin_credit=admin_credit,
    )

    await session.commit()
    await session.refresh(payment_row)
    return payment_row


async def list_party_ledger_accounts(
    session: AsyncSession,
    *,
    party_type: PartyType,
    page: int,
    page_size: int,
    search: str | None = None,
) -> dict:
    if party_type == PartyType.CUSTOMER:
        party_model = Customer
    else:
        party_model = Vendor

    category_id_column = party_model.account_category_id
    stmt = (
        select(
            PartyLedgerAccount.id.label("account_id"),
            PartyLedgerAccount.party_type.label("party_type"),
            PartyLedgerAccount.party_id.label("party_id"),
            func.coalesce(PartyLedgerAccount.party_name_snapshot, party_model.name).label("party_name"),
            category_id_column.label("account_category_id"),
            AccountCategory.name.label("account_category_name"),
            func.coalesce(func.sum(PartyLedgerEntry.admin_debit), Decimal("0")).label("total_debit"),
            func.coalesce(func.sum(PartyLedgerEntry.admin_credit), Decimal("0")).label("total_credit"),
        )
        .select_from(PartyLedgerAccount)
        .join(party_model, party_model.id == PartyLedgerAccount.party_id)
        .outerjoin(AccountCategory, AccountCategory.id == category_id_column)
        .outerjoin(PartyLedgerEntry, PartyLedgerEntry.account_id == PartyLedgerAccount.id)
        .where(PartyLedgerAccount.party_type == party_type)
        .group_by(
            PartyLedgerAccount.id,
            PartyLedgerAccount.party_type,
            PartyLedgerAccount.party_id,
            PartyLedgerAccount.party_name_snapshot,
            party_model.name,
            category_id_column,
            AccountCategory.name,
        )
    )
    if search and search.strip():
        stmt = stmt.where(party_model.name.ilike(f"%{search.strip()}%"))
    stmt = stmt.order_by(func.coalesce(PartyLedgerAccount.party_name_snapshot, party_model.name).asc())

    total = (await session.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))).scalar_one()
    rows = (await session.execute(stmt.offset((page - 1) * page_size).limit(page_size))).mappings().all()
    items = []
    for row in rows:
        balance = Decimal(row["total_debit"]) - Decimal(row["total_credit"])
        items.append(
            {
                "account_id": row["account_id"],
                "party_type": row["party_type"].value if hasattr(row["party_type"], "value") else str(row["party_type"]),
                "party_id": row["party_id"],
                "party_name": row["party_name"] or "-",
                "account_category_id": row["account_category_id"],
                "account_category_name": row["account_category_name"],
                "total_debit": Decimal(row["total_debit"]),
                "total_credit": Decimal(row["total_credit"]),
                "balance": abs(balance),
                "balance_side": "DR" if balance >= 0 else "CR",
            }
        )
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": items, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}


async def get_party_ledger_statement(session: AsyncSession, *, party_type: PartyType, party_id) -> dict:
    if party_type == PartyType.CUSTOMER:
        party = await session.get(Customer, party_id)
    else:
        party = await session.get(Vendor, party_id)
    if party is None:
        raise ValueError(f"{party_type.value.title()} not found")

    account = await ensure_party_ledger_account(
        session,
        party_type=party_type,
        party_id=party_id,
        party_name=party.name,
    )

    rows = (
        await session.execute(
            select(PartyLedgerEntry)
            .where(PartyLedgerEntry.account_id == account.id)
            .order_by(PartyLedgerEntry.entry_date.asc(), PartyLedgerEntry.created_at.asc())
        )
    ).scalars().all()

    running = Decimal("0")
    items = []
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    for row in rows:
        debit = Decimal(row.admin_debit or 0)
        credit = Decimal(row.admin_credit or 0)
        total_debit += debit
        total_credit += credit
        running += debit - credit
        items.append(
            {
                "entry_id": row.id,
                "entry_date": row.entry_date,
                "description": row.description,
                "reference_type": row.reference_type,
                "reference_id": row.reference_id,
                "admin_debit": debit,
                "admin_credit": credit,
                "counterparty_debit": credit,
                "counterparty_credit": debit,
                "running_balance": abs(running),
                "balance_side": "DR" if running >= 0 else "CR",
            }
        )

    return {
        "account_id": account.id,
        "party_type": party_type.value,
        "party_id": party_id,
        "party_name": party.name,
        "items": items,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "balance": abs(running),
        "balance_side": "DR" if running >= 0 else "CR",
    }


async def trial_balance(session: AsyncSession) -> dict[str, str]:
    debit_res = await session.execute(select(func.coalesce(func.sum(LedgerEntry.debit), 0)))
    credit_res = await session.execute(select(func.coalesce(func.sum(LedgerEntry.credit), 0)))
    total_debit = debit_res.scalar_one()
    total_credit = credit_res.scalar_one()
    return {"total_debit": str(total_debit), "total_credit": str(total_credit)}


async def customer_outstanding_breakdown(session: AsyncSession, customer_id) -> dict[str, Decimal]:
    customer = await session.get(Customer, customer_id)
    if customer is None:
        raise ValueError("Customer not found")

    billed_res = await session.execute(
        select(func.coalesce(func.sum(SalesFinalInvoice.total_amount), Decimal("0")))
        .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
        .where(
            SalesOrder.customer_id == customer_id,
            func.upper(SalesFinalInvoice.status).in_([VoucherStatus.CREATED.value, VoucherStatus.POSTED.value]),
            SalesFinalInvoice.deleted_at.is_(None),
        )
    )
    billed_total = Decimal(billed_res.scalar_one())

    paid_res = await session.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0"))).where(Payment.customer_id == customer_id)
    )
    paid_total = Decimal(paid_res.scalar_one())

    debit_res = await session.execute(
        select(func.coalesce(func.sum(DebitNote.amount), Decimal("0")))
        .where(
            DebitNote.reference_invoice_id.in_(
                select(SalesFinalInvoice.id)
                .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
                .where(SalesOrder.customer_id == customer_id)
            )
        )
    )
    debit_note_total = Decimal(debit_res.scalar_one())

    credit_res = await session.execute(
        select(func.coalesce(func.sum(CreditNote.amount), Decimal("0")))
        .where(
            CreditNote.reference_invoice_id.in_(
                select(SalesFinalInvoice.id)
                .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
                .where(SalesOrder.customer_id == customer_id)
            )
        )
    )
    credit_note_total = Decimal(credit_res.scalar_one())

    opening_balance = Decimal(customer.opening_balance or Decimal("0"))
    outstanding = opening_balance + billed_total + debit_note_total - credit_note_total - paid_total

    return {
        "opening_balance": opening_balance,
        "billed_total": billed_total,
        "debit_note_total": debit_note_total,
        "credit_note_total": credit_note_total,
        "paid_total": paid_total,
        "outstanding": outstanding,
    }


async def ledger_summary(session: AsyncSession) -> list[dict[str, Decimal | str]]:
    rows = (
        await session.execute(
            select(
                LedgerEntry.account_name,
                func.coalesce(func.sum(LedgerEntry.debit), Decimal("0")).label("total_debit"),
                func.coalesce(func.sum(LedgerEntry.credit), Decimal("0")).label("total_credit"),
            )
            .group_by(LedgerEntry.account_name)
            .order_by(LedgerEntry.account_name.asc())
        )
    ).all()

    return [
        {
            "account_name": account_name,
            "total_debit": Decimal(total_debit),
            "total_credit": Decimal(total_credit),
            "net": Decimal(total_debit) - Decimal(total_credit),
        }
        for account_name, total_debit, total_credit in rows
    ]


async def customer_statement(session: AsyncSession, customer_id) -> dict:
    invoices = (
        await session.execute(
            select(
                SalesFinalInvoice.id,
                SalesFinalInvoice.invoice_date,
                SalesFinalInvoice.total_amount,
            )
            .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
            .where(
                SalesOrder.customer_id == customer_id,
                SalesFinalInvoice.deleted_at.is_(None),
            )
            .order_by(SalesFinalInvoice.invoice_date.asc(), SalesFinalInvoice.created_at.asc())
        )
    ).all()
    payments = (
        await session.execute(
            select(Payment.id, Payment.payment_date, Payment.amount)
            .where(Payment.customer_id == customer_id)
            .order_by(Payment.payment_date.asc().nulls_last(), Payment.created_at.asc())
        )
    ).all()
    return {
        "invoices": [
            {"id": str(row[0]), "date": row[1], "amount": Decimal(row[2])}
            for row in invoices
        ],
        "payments": [
            {"id": str(row[0]), "date": row[1], "amount": Decimal(row[2])}
            for row in payments
        ],
    }


async def customer_aging(session: AsyncSession, customer_id) -> dict[str, Decimal]:
    rows = (
        await session.execute(
            select(SalesFinalInvoice.invoice_date, SalesFinalInvoice.total_amount)
            .join(SalesOrder, SalesOrder.id == SalesFinalInvoice.sales_order_id)
            .where(
                SalesOrder.customer_id == customer_id,
                SalesFinalInvoice.deleted_at.is_(None),
            )
        )
    ).all()

    today = date.today()
    buckets = {
        "0_30": Decimal("0"),
        "31_60": Decimal("0"),
        "61_90": Decimal("0"),
        "91_plus": Decimal("0"),
    }
    for inv_date, amount in rows:
        age = (today - inv_date).days
        amt = Decimal(amount)
        if age <= 30:
            buckets["0_30"] += amt
        elif age <= 60:
            buckets["31_60"] += amt
        elif age <= 90:
            buckets["61_90"] += amt
        else:
            buckets["91_plus"] += amt
    return buckets


async def create_journal_entry(session: AsyncSession, payload) -> JournalEntry:
    total_debit = sum(Decimal(line.debit) for line in payload.lines)
    total_credit = sum(Decimal(line.credit) for line in payload.lines)
    if total_debit <= 0 or total_credit <= 0:
        raise ValueError("Journal entry must have positive debit and credit totals")
    if total_debit != total_credit:
        raise ValueError("Journal entry is not balanced")

    entry = JournalEntry(
        entry_date=payload.entry_date,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id,
        note=payload.note,
        status=payload.status.strip().upper(),
    )
    session.add(entry)
    await session.flush()

    for line in payload.lines:
        session.add(
            JournalLine(
                journal_entry_id=entry.id,
                line_no=line.line_no,
                account_id=line.account_id,
                account_name=line.account_name,
                debit=line.debit,
                credit=line.credit,
            )
        )
        session.add(
            LedgerEntry(
                account_id=line.account_id,
                account_name=line.account_name,
                debit=line.debit,
                credit=line.credit,
                reference_type="journal_entry",
                reference_id=entry.id,
                entry_date=payload.entry_date,
            )
        )

    await session.commit()
    await session.refresh(entry)
    return entry


async def allocate_payment_to_invoice(
    session: AsyncSession,
    *,
    payment_id,
    sales_final_invoice_id,
    allocated_amount: Decimal,
) -> PaymentAllocation:
    if allocated_amount <= 0:
        raise ValueError("allocated_amount must be greater than zero")

    payment = await session.get(Payment, payment_id)
    if payment is None:
        raise ValueError("Payment not found")
    invoice = await session.get(SalesFinalInvoice, sales_final_invoice_id)
    if invoice is None:
        raise ValueError("Sales final invoice not found")

    already_allocated = (
        await session.execute(
            select(func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0"))).where(
                PaymentAllocation.payment_id == payment_id
            )
        )
    ).scalar_one()
    remaining = Decimal(payment.amount) - Decimal(already_allocated or Decimal("0"))
    if allocated_amount > remaining:
        raise ValueError("Allocation exceeds remaining payment amount")

    row = PaymentAllocation(
        payment_id=payment_id,
        sales_final_invoice_id=sales_final_invoice_id,
        allocated_amount=allocated_amount,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row
