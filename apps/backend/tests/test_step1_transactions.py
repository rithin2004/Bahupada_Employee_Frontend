from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models.entities import (
    CreditNote,
    Customer,
    CustomerClass,
    InvoiceVersion,
    OrderSource,
    Product,
    PurchaseBill,
    PurchaseChallan,
    SalesFinalInvoice,
    SalesInitialInvoice,
    SalesOrder,
    Vendor,
    Warehouse,
)


async def _seed_master_data(db_session):
    warehouse = Warehouse(code="WH-TEST", name="WH Test")
    vendor = Vendor(name="Vendor Test")
    product = Product(sku="SKU-TEST", name="Product Test", unit="PCS", base_price=Decimal("100"), tax_percent=Decimal("5"))
    customer = Customer(name="Customer Test", customer_class=CustomerClass.B2C)
    db_session.add_all([warehouse, vendor, product, customer])
    await db_session.commit()
    await db_session.refresh(warehouse)
    await db_session.refresh(vendor)
    await db_session.refresh(product)
    await db_session.refresh(customer)
    return warehouse, vendor, product, customer


@pytest.mark.asyncio
async def test_idempotent_purchase_challan_replay(client, db_session):
    warehouse, vendor, product, _ = await _seed_master_data(db_session)

    payload = {
        "warehouse_id": str(warehouse.id),
        "vendor_id": str(vendor.id),
        "reference_no": "PC-1001",
        "items": [{"product_id": str(product.id), "quantity": "5"}],
    }
    headers = {"X-Idempotency-Key": "idem-pc-1001"}

    r1 = await client.post("/api/v1/procurement/purchase-challans", json=payload, headers=headers)
    r2 = await client.post("/api/v1/procurement/purchase-challans", json=payload, headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]

    count = (await db_session.execute(select(func.count(PurchaseChallan.id)))).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_idempotency_conflict_different_payload(client, db_session):
    warehouse, vendor, product, _ = await _seed_master_data(db_session)

    payload1 = {
        "warehouse_id": str(warehouse.id),
        "vendor_id": str(vendor.id),
        "reference_no": "PC-2001",
        "items": [{"product_id": str(product.id), "quantity": "2"}],
    }
    payload2 = {
        "warehouse_id": str(warehouse.id),
        "vendor_id": str(vendor.id),
        "reference_no": "PC-2002",
        "items": [{"product_id": str(product.id), "quantity": "3"}],
    }
    headers = {"X-Idempotency-Key": "idem-conflict-1"}

    r1 = await client.post("/api/v1/procurement/purchase-challans", json=payload1, headers=headers)
    r2 = await client.post("/api/v1/procurement/purchase-challans", json=payload2, headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_invoice_edit_creates_version_and_credit_note(client, db_session):
    warehouse, _, _, customer = await _seed_master_data(db_session)

    sales_order = SalesOrder(
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        source=OrderSource.ADMIN,
        status="pending",
    )
    db_session.add(sales_order)
    await db_session.flush()

    initial = SalesInitialInvoice(
        sales_order_id=sales_order.id,
        invoice_number="SI-1",
        status="CREATED",
    )
    db_session.add(initial)
    await db_session.flush()

    final = SalesFinalInvoice(
        sales_initial_invoice_id=initial.id,
        invoice_number="SF-1",
        invoice_date=date.today(),
        subtotal=Decimal("100"),
        gst_amount=Decimal("18"),
        total_amount=Decimal("118"),
        status="CREATED",
    )
    db_session.add(final)
    await db_session.commit()

    payload = {
        "total_amount": "100",
        "reason": "Price correction",
        "auto_note": True,
    }
    headers = {"X-Idempotency-Key": "idem-sf-edit-1"}
    r = await client.post(f"/api/v1/sales/sales-final-invoices/{final.id}/edit", json=payload, headers=headers)

    assert r.status_code == 200
    body = r.json()
    assert int(body["version"]) == 2
    assert any(n["type"] == "CREDIT_NOTE" for n in body["notes"])

    version_count = (
        await db_session.execute(select(func.count(InvoiceVersion.id)).where(InvoiceVersion.sales_final_invoice_id == final.id))
    ).scalar_one()
    note_count = (
        await db_session.execute(select(func.count(CreditNote.id)).where(CreditNote.reference_invoice_id == final.id))
    ).scalar_one()

    assert version_count == 1
    assert note_count == 1


@pytest.mark.asyncio
async def test_invalid_status_transition_blocked_for_purchase_post(client, db_session):
    warehouse, vendor, _, _ = await _seed_master_data(db_session)

    challan = PurchaseChallan(
        warehouse_id=warehouse.id,
        vendor_id=vendor.id,
        reference_no="PC-INVALID-1",
        status="CANCELLED",
    )
    db_session.add(challan)
    await db_session.flush()

    bill = PurchaseBill(
        purchase_challan_id=challan.id,
        bill_number="PB-INVALID-1",
        bill_date=date.today(),
        status="CREATED",
        posted=False,
    )
    db_session.add(bill)
    await db_session.commit()

    r = await client.post(f"/api/v1/procurement/purchase-bills/{bill.id}/post")
    assert r.status_code == 400
    assert "Invalid status transition" in r.json()["detail"]
