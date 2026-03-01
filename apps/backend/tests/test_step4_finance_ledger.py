from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models.entities import (
    CreditNote,
    Customer,
    CustomerClass,
    DebitNote,
    LedgerEntry,
    OrderSource,
    Payment,
    Product,
    SalesFinalInvoice,
    SalesInitialInvoice,
    SalesOrder,
    Warehouse,
)


async def _seed_customer_with_warehouse(db_session, code_suffix: str):
    warehouse = Warehouse(code=f"WH-S4-{code_suffix}", name=f"WH Step4 {code_suffix}")
    customer = Customer(name=f"Customer S4 {code_suffix}", customer_class=CustomerClass.B2C)
    product = Product(
        sku=f"SKU-S4-{code_suffix}",
        name=f"Product S4 {code_suffix}",
        unit="PCS",
        base_price=Decimal("100"),
        tax_percent=Decimal("5"),
    )
    db_session.add_all([warehouse, customer, product])
    await db_session.commit()
    await db_session.refresh(warehouse)
    await db_session.refresh(customer)
    await db_session.refresh(product)
    return warehouse, customer, product


@pytest.mark.asyncio
async def test_payment_idempotency_replay_and_ledger_double_entry(client, db_session):
    _warehouse, customer, _product = await _seed_customer_with_warehouse(db_session, "IDEMP")

    payload = {
        "customer_id": str(customer.id),
        "amount": "250.00",
        "mode": "CASH",
        "reference_type": "SALES_COLLECTION",
        "reference_id": None,
    }
    headers = {"X-Idempotency-Key": "idem-fin-001"}

    r1 = await client.post("/api/v1/finance/payments", json=payload, headers=headers)
    r2 = await client.post("/api/v1/finance/payments", json=payload, headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]

    payment_count = (await db_session.execute(select(func.count(Payment.id)))).scalar_one()
    ledger_count = (await db_session.execute(select(func.count(LedgerEntry.id)))).scalar_one()

    assert payment_count == 1
    assert ledger_count == 2


@pytest.mark.asyncio
async def test_payment_idempotency_conflict_for_different_payload(client, db_session):
    _warehouse, customer, _product = await _seed_customer_with_warehouse(db_session, "CONFLICT")

    headers = {"X-Idempotency-Key": "idem-fin-002"}
    payload_1 = {
        "customer_id": str(customer.id),
        "amount": "100.00",
        "mode": "UPI",
        "reference_type": "SALES_COLLECTION",
        "reference_id": None,
    }
    payload_2 = {
        "customer_id": str(customer.id),
        "amount": "200.00",
        "mode": "UPI",
        "reference_type": "SALES_COLLECTION",
        "reference_id": None,
    }

    r1 = await client.post("/api/v1/finance/payments", json=payload_1, headers=headers)
    r2 = await client.post("/api/v1/finance/payments", json=payload_2, headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_customer_outstanding_uses_final_invoice_notes_and_payments(client, db_session):
    warehouse, customer, _product = await _seed_customer_with_warehouse(db_session, "OUT")
    customer.opening_balance = Decimal("50")

    order = SalesOrder(customer_id=customer.id, warehouse_id=warehouse.id, source=OrderSource.ADMIN, status="PENDING")
    db_session.add(order)
    await db_session.flush()

    initial = SalesInitialInvoice(sales_order_id=order.id, invoice_number="SI-S4-OUT", status="CREATED")
    db_session.add(initial)
    await db_session.flush()

    final = SalesFinalInvoice(
        sales_initial_invoice_id=initial.id,
        invoice_number="SF-S4-OUT",
        invoice_date=date.today(),
        subtotal=Decimal("300"),
        gst_amount=Decimal("0"),
        total_amount=Decimal("300"),
        status="POSTED",
    )
    db_session.add(final)
    await db_session.flush()

    db_session.add(DebitNote(reference_invoice_id=final.id, amount=Decimal("20"), reason="Rate diff"))
    db_session.add(CreditNote(reference_invoice_id=final.id, amount=Decimal("10"), reason="Discount adjustment"))
    await db_session.commit()

    pay_res = await client.post(
        "/api/v1/finance/payments",
        json={
            "customer_id": str(customer.id),
            "amount": "120.00",
            "mode": "CASH",
            "reference_type": "SALES_COLLECTION",
            "reference_id": None,
        },
    )
    assert pay_res.status_code == 200

    out_res = await client.get(f"/api/v1/finance/customers/{customer.id}/outstanding")
    assert out_res.status_code == 200
    body = out_res.json()
    assert Decimal(body["opening_balance"]) == Decimal("50.0000")
    assert Decimal(body["billed_total"]) == Decimal("300.0000")
    assert Decimal(body["debit_note_total"]) == Decimal("20.0000")
    assert Decimal(body["credit_note_total"]) == Decimal("10.0000")
    assert Decimal(body["paid_total"]) == Decimal("120.0000")
    assert Decimal(body["outstanding"]) == Decimal("240.0000")


@pytest.mark.asyncio
async def test_trial_balance_balances_after_payment_posting(client, db_session):
    _warehouse, customer, _product = await _seed_customer_with_warehouse(db_session, "TB")

    payment_res = await client.post(
        "/api/v1/finance/payments",
        json={
            "customer_id": str(customer.id),
            "amount": "333.33",
            "mode": "BANK",
            "reference_type": "SALES_COLLECTION",
            "reference_id": None,
        },
    )
    assert payment_res.status_code == 200

    tb_res = await client.get("/api/v1/finance/ledger/trial-balance")
    assert tb_res.status_code == 200
    body = tb_res.json()

    assert Decimal(body["total_debit"]) == Decimal("333.3300")
    assert Decimal(body["total_credit"]) == Decimal("333.3300")


@pytest.mark.asyncio
async def test_payment_amount_must_be_positive(client, db_session):
    _warehouse, customer, _product = await _seed_customer_with_warehouse(db_session, "NEG")
    res = await client.post(
        "/api/v1/finance/payments",
        json={
            "customer_id": str(customer.id),
            "amount": "0",
            "mode": "CASH",
            "reference_type": "SALES_COLLECTION",
            "reference_id": None,
        },
    )
    assert res.status_code == 400
    assert "greater than zero" in res.json()["detail"]


@pytest.mark.asyncio
async def test_ledger_summary_groups_accounts(client, db_session):
    _warehouse, customer, _product = await _seed_customer_with_warehouse(db_session, "SUM")
    payment_res = await client.post(
        "/api/v1/finance/payments",
        json={
            "customer_id": str(customer.id),
            "amount": "50.00",
            "mode": "CASH",
            "reference_type": "SALES_COLLECTION",
            "reference_id": None,
        },
    )
    assert payment_res.status_code == 200

    res = await client.get("/api/v1/finance/ledger/summary")
    assert res.status_code == 200
    items = {row["account_name"]: row for row in res.json()["items"]}
    assert "Cash/Bank" in items
    assert "Customer Receivable" in items
    assert Decimal(items["Cash/Bank"]["total_debit"]) == Decimal("50.0000")
    assert Decimal(items["Customer Receivable"]["total_credit"]) == Decimal("50.0000")
