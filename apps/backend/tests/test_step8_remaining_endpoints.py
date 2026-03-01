from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.entities import CustomerClass, OrderSource


async def _seed_core(client, suffix: str):
    wh = (
        await client.post(
            "/api/v1/masters/warehouses",
            json={"code": f"WH-S8-{suffix}", "name": f"Warehouse S8 {suffix}"},
        )
    ).json()
    vendor = (await client.post("/api/v1/masters/vendors", json={"name": f"Vendor S8 {suffix}"})).json()
    customer = (
        await client.post(
            "/api/v1/masters/customers",
            json={"name": f"Customer S8 {suffix}", "customer_class": CustomerClass.B2C.value},
        )
    ).json()
    product = (
        await client.post(
            "/api/v1/masters/products",
            json={
                "sku": f"SKU-S8-{suffix}",
                "name": f"Product S8 {suffix}",
                "unit": "PCS",
                "base_price": "100",
                "tax_percent": "5",
            },
        )
    ).json()
    return wh, vendor, customer, product


@pytest.mark.asyncio
async def test_procurement_remaining_endpoints(client):
    wh, vendor, _customer, product = await _seed_core(client, "P")

    pr = await client.post(
        "/api/v1/procurement/purchase-returns",
        json={
            "vendor_id": vendor["id"],
            "warehouse_id": wh["id"],
            "return_date": str(date.today()),
            "items": [{"product_id": product["id"], "batch_number": "B1", "quantity": "1"}],
        },
    )
    assert pr.status_code == 200
    assert (await client.get("/api/v1/procurement/purchase-returns")).status_code == 200

    pe = await client.post(
        "/api/v1/procurement/purchase-expiries",
        json={
            "vendor_id": vendor["id"],
            "warehouse_id": wh["id"],
            "expiry_date": str(date.today()),
            "items": [{"product_id": product["id"], "batch_number": "B1", "quantity": "1"}],
        },
    )
    assert pe.status_code == 200
    assert (await client.get("/api/v1/procurement/purchase-expiries")).status_code == 200

    wt = await client.post(
        "/api/v1/procurement/warehouse-transfers",
        json={
            "from_warehouse_id": wh["id"],
            "to_warehouse_id": wh["id"],
            "items": [{"product_id": product["id"], "batch_number": "B1", "quantity": "1"}],
        },
    )
    assert wt.status_code == 400

    wh2 = (
        await client.post(
            "/api/v1/masters/warehouses",
            json={"code": "WH-S8-ALT", "name": "Warehouse S8 ALT"},
        )
    ).json()
    wt_ok = await client.post(
        "/api/v1/procurement/warehouse-transfers",
        json={
            "from_warehouse_id": wh["id"],
            "to_warehouse_id": wh2["id"],
            "items": [{"product_id": product["id"], "batch_number": "B1", "quantity": "1"}],
        },
    )
    assert wt_ok.status_code == 200
    assert (await client.get("/api/v1/procurement/warehouse-transfers")).status_code == 200

    rl = await client.post(
        "/api/v1/procurement/reorder-logs",
        json={
            "warehouse_id": wh["id"],
            "days": 7,
            "items": [{"product_id": product["id"], "suggested_qty": "5", "final_qty": "4"}],
        },
    )
    assert rl.status_code == 200
    assert (await client.get("/api/v1/procurement/reorder-logs")).status_code == 200


@pytest.mark.asyncio
async def test_sales_returns_and_expiries_endpoints(client):
    wh, _vendor, customer, product = await _seed_core(client, "S")

    so = (
        await client.post(
            "/api/v1/sales/sales-orders",
            json={
                "warehouse_id": wh["id"],
                "customer_id": customer["id"],
                "source": OrderSource.ADMIN.value,
                "items": [{"product_id": product["id"], "quantity": "1"}],
            },
        )
    ).json()
    si = (
        await client.post(
            "/api/v1/sales/sales-initial-invoices",
            json={"sales_order_id": so["id"], "invoice_number": "SI-S8"},
        )
    ).json()
    sf = (
        await client.post(
            "/api/v1/sales/sales-final-invoices",
            json={
                "sales_initial_invoice_id": si["id"],
                "invoice_number": "SF-S8",
                "invoice_date": str(date.today()),
                "subtotal": "100",
                "gst_amount": "0",
                "total_amount": "100",
                "status": "POSTED",
            },
        )
    ).json()

    sr = await client.post(
        "/api/v1/sales/sales-returns",
        json={
            "sales_final_invoice_id": sf["id"],
            "return_date": str(date.today()),
            "items": [{"product_id": product["id"], "batch_number": "B1", "quantity": "1"}],
        },
    )
    assert sr.status_code == 200
    assert (await client.get("/api/v1/sales/sales-returns")).status_code == 200

    se = await client.post(
        "/api/v1/sales/sales-expiries",
        json={
            "customer_id": customer["id"],
            "expiry_date": str(date.today()),
            "items": [{"product_id": product["id"], "batch_number": "B1", "quantity": "1"}],
        },
    )
    assert se.status_code == 200
    assert (await client.get("/api/v1/sales/sales-expiries")).status_code == 200


@pytest.mark.asyncio
async def test_masters_detail_patch_delete_endpoints(client):
    wh, vendor, customer, product = await _seed_core(client, "M")

    gp = await client.get(f"/api/v1/masters/products/{product['id']}")
    assert gp.status_code == 200
    pp = await client.patch(f"/api/v1/masters/products/{product['id']}", json={"brand": "BrandX"})
    assert pp.status_code == 200
    dp = await client.delete(f"/api/v1/masters/products/{product['id']}")
    assert dp.status_code == 200

    gc = await client.get(f"/api/v1/masters/customers/{customer['id']}")
    assert gc.status_code == 200
    pc = await client.patch(f"/api/v1/masters/customers/{customer['id']}", json={"credit_limit": "500"})
    assert pc.status_code == 200
    dc = await client.delete(f"/api/v1/masters/customers/{customer['id']}")
    assert dc.status_code == 200

    gw = await client.get(f"/api/v1/masters/warehouses/{wh['id']}")
    assert gw.status_code == 200
    dw = await client.delete(f"/api/v1/masters/warehouses/{wh['id']}")
    assert dw.status_code == 200

    gv = await client.get(f"/api/v1/masters/vendors/{vendor['id']}")
    assert gv.status_code == 200
    dv = await client.delete(f"/api/v1/masters/vendors/{vendor['id']}")
    assert dv.status_code == 200


@pytest.mark.asyncio
async def test_finance_statement_and_aging_endpoints(client):
    wh, _vendor, customer, product = await _seed_core(client, "F")
    customer_id = customer["id"]
    so = (
        await client.post(
            "/api/v1/sales/sales-orders",
            json={
                "warehouse_id": wh["id"],
                "customer_id": customer_id,
                "source": OrderSource.ADMIN.value,
                "items": [{"product_id": product["id"], "quantity": "1"}],
            },
        )
    ).json()
    si = (
        await client.post(
            "/api/v1/sales/sales-initial-invoices",
            json={"sales_order_id": so["id"], "invoice_number": "SI-S8-F"},
        )
    ).json()
    await client.post(
        "/api/v1/sales/sales-final-invoices",
        json={
            "sales_initial_invoice_id": si["id"],
            "invoice_number": "SF-S8-F",
            "invoice_date": str(date.today() - timedelta(days=40)),
            "subtotal": "100",
            "gst_amount": "0",
            "total_amount": "100",
            "status": "POSTED",
        },
    )
    pay = await client.post(
        "/api/v1/finance/payments",
        json={
            "customer_id": customer_id,
            "amount": "25",
            "mode": "CASH",
            "reference_type": "SALES_COLLECTION",
            "reference_id": None,
        },
    )
    assert pay.status_code == 200

    st = await client.get(f"/api/v1/finance/customers/{customer_id}/statement")
    assert st.status_code == 200
    assert len(st.json()["invoices"]) >= 1
    assert len(st.json()["payments"]) >= 1

    aging = await client.get(f"/api/v1/finance/customers/{customer_id}/aging")
    assert aging.status_code == 200
    total = (
        Decimal(aging.json()["bucket_0_30"])
        + Decimal(aging.json()["bucket_31_60"])
        + Decimal(aging.json()["bucket_61_90"])
        + Decimal(aging.json()["bucket_91_plus"])
    )
    assert total >= Decimal("100.0000")
