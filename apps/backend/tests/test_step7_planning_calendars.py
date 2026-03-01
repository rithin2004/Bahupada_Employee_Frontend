from datetime import date

import pytest

from app.models.entities import EmployeeRole


async def _seed_area_and_route(client, suffix: str):
    area = await client.post("/api/v1/masters/areas", json={"area_name": f"Area S7 {suffix}"})
    assert area.status_code == 200
    route = await client.post(
        "/api/v1/masters/routes",
        json={"route_name": f"Route S7 {suffix}", "area_id": area.json()["id"]},
    )
    assert route.status_code == 200
    return route.json()


async def _seed_warehouse(client, suffix: str):
    wh = await client.post("/api/v1/masters/warehouses", json={"code": f"WH-S7-{suffix}", "name": f"WH S7 {suffix}"})
    assert wh.status_code == 200
    return wh.json()


async def _seed_employee(client, warehouse_id: str, role: EmployeeRole, suffix: str):
    employee = await client.post(
        "/api/v1/masters/employees",
        json={
            "warehouse_id": warehouse_id,
            "full_name": f"{role.value} S7 {suffix}",
            "role": role.value,
            "phone": f"97{suffix:0>8}",
        },
    )
    assert employee.status_code == 200
    return employee.json()


async def _seed_vehicle(client, suffix: str):
    vehicle = await client.post(
        "/api/v1/masters/vehicles",
        json={"registration_no": f"TS09S7{suffix}", "vehicle_name": f"Vehicle S7 {suffix}"},
    )
    assert vehicle.status_code == 200
    return vehicle.json()


@pytest.mark.asyncio
async def test_salesman_monthly_calendar_admin_create_and_assign(client):
    wh = await _seed_warehouse(client, "01")
    route = await _seed_area_and_route(client, "01")
    salesman = await _seed_employee(client, wh["id"], EmployeeRole.SALESMAN, "1001")

    plan_res = await client.post(
        "/api/v1/planning/salesman/monthly-plans",
        json={"plan_name": "Salesman Plan Feb 2026", "month": 2, "year": 2026},
    )
    assert plan_res.status_code == 200
    plan = plan_res.json()

    duty_date = date(2026, 2, 2)
    assign_res = await client.post(
        f"/api/v1/planning/salesman/monthly-plans/{plan['id']}/assignments",
        json={
            "duty_date": str(duty_date),
            "salesman_id": salesman["id"],
            "route_id": route["id"],
            "note": "Monthly admin schedule",
            "is_override": False,
        },
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["salesman_id"] == salesman["id"]

    list_res = await client.get(f"/api/v1/planning/salesman/monthly-plans/{plan['id']}/assignments")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1
    assert list_res.json()[0]["route_id"] == route["id"]


@pytest.mark.asyncio
async def test_salesman_monthly_calendar_role_validation(client):
    wh = await _seed_warehouse(client, "02")
    route = await _seed_area_and_route(client, "02")
    not_salesman = await _seed_employee(client, wh["id"], EmployeeRole.PACKER, "1002")

    plan_res = await client.post(
        "/api/v1/planning/salesman/monthly-plans",
        json={"plan_name": "Salesman Plan Mar 2026", "month": 3, "year": 2026},
    )
    assert plan_res.status_code == 200
    plan = plan_res.json()

    bad_res = await client.post(
        f"/api/v1/planning/salesman/monthly-plans/{plan['id']}/assignments",
        json={
            "duty_date": "2026-03-01",
            "salesman_id": not_salesman["id"],
            "route_id": route["id"],
        },
    )
    assert bad_res.status_code == 400
    assert "SALESMAN" in bad_res.json()["detail"]


@pytest.mark.asyncio
async def test_delivery_monthly_duty_assignment_admin_upsert(client):
    wh = await _seed_warehouse(client, "03")
    vehicle = await _seed_vehicle(client, "03")
    driver = await _seed_employee(client, wh["id"], EmployeeRole.DRIVER, "1003")
    helper = await _seed_employee(client, wh["id"], EmployeeRole.IN_VEHICLE_HELPER, "1004")
    bill_manager = await _seed_employee(client, wh["id"], EmployeeRole.BILL_MANAGER, "1005")
    loader = await _seed_employee(client, wh["id"], EmployeeRole.LOADER, "1006")

    monthly = await client.post(
        "/api/v1/delivery/plans/monthly",
        json={"plan_name": "Delivery Plan Feb 2026", "month": 2, "year": 2026},
    )
    assert monthly.status_code == 200
    monthly_plan = monthly.json()

    upsert_res = await client.post(
        f"/api/v1/planning/delivery/monthly-plans/{monthly_plan['id']}/assignments",
        json={
            "duty_date": "2026-02-02",
            "vehicle_id": vehicle["id"],
            "driver_id": driver["id"],
            "helper_id": helper["id"],
            "bill_manager_id": bill_manager["id"],
            "loader_id": loader["id"],
        },
    )
    assert upsert_res.status_code == 200
    first_id = upsert_res.json()["id"]

    # override same date/team slot
    upsert_res2 = await client.post(
        f"/api/v1/planning/delivery/monthly-plans/{monthly_plan['id']}/assignments",
        json={
            "duty_date": "2026-02-02",
            "vehicle_id": vehicle["id"],
            "driver_id": driver["id"],
            "helper_id": helper["id"],
            "bill_manager_id": bill_manager["id"],
            "loader_id": loader["id"],
        },
    )
    assert upsert_res2.status_code == 200
    assert upsert_res2.json()["id"] == first_id

    list_res = await client.get(f"/api/v1/planning/delivery/monthly-plans/{monthly_plan['id']}/assignments")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1
