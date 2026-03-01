from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.entities import EmployeeRole, Warehouse


async def _seed_warehouse(client, suffix: str):
    res = await client.post(
        "/api/v1/masters/warehouses",
        json={"code": f"WH-S6-{suffix}", "name": f"Warehouse S6 {suffix}"},
    )
    assert res.status_code == 200
    return res.json()


async def _seed_employee(client, warehouse_id: str, suffix: str):
    res = await client.post(
        "/api/v1/masters/employees",
        json={
            "warehouse_id": warehouse_id,
            "full_name": f"Employee S6 {suffix}",
            "role": EmployeeRole.PACKER.value,
            "phone": f"98{suffix:0>8}",
        },
    )
    assert res.status_code == 200
    return res.json()


async def _seed_product(client, suffix: str):
    res = await client.post(
        "/api/v1/masters/products",
        json={
            "sku": f"SKU-S6-{suffix}",
            "name": f"Product S6 {suffix}",
            "unit": "PCS",
            "base_price": "100",
            "tax_percent": "5",
        },
    )
    assert res.status_code == 200
    return res.json()


@pytest.mark.asyncio
async def test_payroll_create_salary_and_mark_paid(client):
    wh = await _seed_warehouse(client, "P1")
    employee = await _seed_employee(client, wh["id"], "1")

    create_res = await client.post(
        "/api/v1/payroll/salaries",
        json={
            "employee_id": employee["id"],
            "month": 2,
            "year": 2026,
            "basic": "10000",
            "allowance": "2000",
            "deductions": "500",
        },
    )
    assert create_res.status_code == 200
    salary = create_res.json()
    assert Decimal(salary["net_salary"]) == Decimal("11500.0000")
    assert salary["paid_status"] == "PENDING"

    mark_res = await client.patch(
        f"/api/v1/payroll/salaries/{salary['id']}/mark-paid",
        json={"paid_status": "PAID"},
    )
    assert mark_res.status_code == 200
    assert mark_res.json()["paid_status"] == "PAID"


@pytest.mark.asyncio
async def test_payroll_salary_run_and_list_filtering(client):
    wh = await _seed_warehouse(client, "P2")
    await _seed_employee(client, wh["id"], "2")
    await _seed_employee(client, wh["id"], "3")

    run_res = await client.post(
        "/api/v1/payroll/salary-runs",
        json={"month": 3, "year": 2026, "warehouse_id": wh["id"]},
    )
    assert run_res.status_code == 200
    assert run_res.json()["created_count"] == 2

    list_res = await client.get("/api/v1/payroll/salaries?month=3&year=2026")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 2


@pytest.mark.asyncio
async def test_schemes_create_link_active_and_detail(client):
    product = await _seed_product(client, "1")
    start = date.today()
    end = start + timedelta(days=10)

    scheme_res = await client.post(
        "/api/v1/schemes",
        json={
            "scheme_name": "S6 Scheme 1",
            "scheme_type": "DISCOUNT",
            "start_date": str(start),
            "end_date": str(end),
            "is_active": True,
        },
    )
    assert scheme_res.status_code == 200
    scheme = scheme_res.json()

    link_res = await client.post(
        f"/api/v1/schemes/{scheme['id']}/products",
        json={"product_id": product["id"], "discount_percent": "12"},
    )
    assert link_res.status_code == 200
    assert Decimal(link_res.json()["discount_percent"]) == Decimal("12.0000")

    active_res = await client.get(f"/api/v1/schemes/active?on_date={start}")
    assert active_res.status_code == 200
    assert len(active_res.json()) >= 1

    detail_res = await client.get(f"/api/v1/schemes/{scheme['id']}")
    assert detail_res.status_code == 200
    assert detail_res.json()["scheme"]["id"] == scheme["id"]
    assert len(detail_res.json()["products"]) == 1


@pytest.mark.asyncio
async def test_system_go_live_checks_contract(client):
    res = await client.get("/api/v1/system/go-live-checks")
    assert res.status_code == 200
    body = res.json()
    assert "overall_ready" in body
    assert "checks" in body
    names = {c["name"] for c in body["checks"]}
    assert "DATABASE_CONNECTIVITY" in names
    assert "JWT_SECRET_ROTATED" in names
    assert "DATABASE_URL_CONFIGURED" in names
