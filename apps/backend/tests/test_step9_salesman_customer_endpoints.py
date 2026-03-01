from datetime import date
from decimal import Decimal

import pytest

from app.models.entities import CustomerClass, EmployeeRole, OrderSource


async def _seed_salesman_customer_flow(client):
    wh = (
        await client.post(
            "/api/v1/masters/warehouses",
            json={"code": "WH-S9-1", "name": "WH S9"},
        )
    ).json()
    area = (await client.post("/api/v1/masters/areas", json={"area_name": "Area S9"})).json()
    route = (
        await client.post(
            "/api/v1/masters/routes",
            json={"route_name": "Route S9", "area_id": area["id"]},
        )
    ).json()
    salesman = (
        await client.post(
            "/api/v1/masters/employees",
            json={
                "warehouse_id": wh["id"],
                "full_name": "Salesman S9",
                "role": EmployeeRole.SALESMAN.value,
                "phone": "9699999901",
            },
        )
    ).json()
    customer = (
        await client.post(
            "/api/v1/masters/customers",
            json={"name": "Customer S9", "customer_class": CustomerClass.B2C.value, "route_id": route["id"]},
        )
    ).json()
    product = (
        await client.post(
            "/api/v1/masters/products",
            json={"sku": "SKU-S9", "name": "Product S9", "unit": "PCS", "base_price": "100", "tax_percent": "5"},
        )
    ).json()
    return wh, route, salesman, customer, product


@pytest.mark.asyncio
async def test_salesman_visit_and_performance_endpoints(client):
    _wh, route, salesman, customer, _product = await _seed_salesman_customer_flow(client)

    plan = (
        await client.post(
            "/api/v1/planning/salesman/monthly-plans",
            json={"plan_name": "S9 Plan", "month": 2, "year": 2026},
        )
    ).json()
    assign = await client.post(
        f"/api/v1/planning/salesman/monthly-plans/{plan['id']}/assignments",
        json={"duty_date": str(date.today()), "salesman_id": salesman["id"], "route_id": route["id"]},
    )
    assert assign.status_code == 200

    visit = await client.post(
        "/api/v1/salesman/visits",
        json={
            "salesman_id": salesman["id"],
            "customer_id": customer["id"],
            "route_id": route["id"],
            "visit_date": str(date.today()),
            "status": "VISITED",
        },
    )
    assert visit.status_code == 200

    visits = await client.get(f"/api/v1/salesman/visits?salesman_id={salesman['id']}")
    assert visits.status_code == 200
    assert len(visits.json()) >= 1

    perf = await client.get(f"/api/v1/salesman/performance/{salesman['id']}")
    assert perf.status_code == 200
    assert perf.json()["planned_count"] >= 1
    assert perf.json()["visited_count"] >= 1
    assert Decimal(perf.json()["adherence_percent"]) >= Decimal("100.00")


@pytest.mark.asyncio
async def test_customer_self_service_endpoints(client):
    wh, _route, _salesman, customer, product = await _seed_salesman_customer_flow(client)

    so = (
        await client.post(
            "/api/v1/sales/sales-orders",
            json={
                "warehouse_id": wh["id"],
                "customer_id": customer["id"],
                "source": OrderSource.CUSTOMER.value,
                "items": [{"product_id": product["id"], "quantity": "2"}],
            },
        )
    ).json()
    assert so["id"] is not None

    pay = await client.post(
        "/api/v1/finance/payments",
        json={
            "customer_id": customer["id"],
            "amount": "30",
            "mode": "CASH",
            "reference_type": "SALES_COLLECTION",
            "reference_id": None,
        },
    )
    assert pay.status_code == 200

    profile = await client.get(f"/api/v1/customer/customers/{customer['id']}/profile")
    assert profile.status_code == 200
    assert profile.json()["id"] == customer["id"]

    orders = await client.get(f"/api/v1/customer/customers/{customer['id']}/orders")
    assert orders.status_code == 200
    assert len(orders.json()) >= 1

    payments = await client.get(f"/api/v1/customer/customers/{customer['id']}/payments")
    assert payments.status_code == 200
    assert len(payments.json()) >= 1
