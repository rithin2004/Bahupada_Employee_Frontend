from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.entities import (
    AttendanceLog,
    Customer,
    CustomerClass,
    DeliveryAssignment,
    DeliveryRun,
    DeliveryRunStop,
    Employee,
    EmployeeRole,
    OrderSource,
    PackingTask,
    PodEvent,
    SalesInitialInvoice,
    SalesOrder,
    Warehouse,
)


async def _seed_warehouse_and_customer(db_session):
    warehouse = Warehouse(code="WH-S3", name="WH Step3")
    customer = Customer(name="Customer S3", customer_class=CustomerClass.B2C)
    db_session.add_all([warehouse, customer])
    await db_session.commit()
    await db_session.refresh(warehouse)
    await db_session.refresh(customer)
    return warehouse, customer


async def _seed_order_with_initial_invoice(db_session, warehouse_id, customer_id, invoice_number: str):
    order = SalesOrder(
        customer_id=customer_id,
        warehouse_id=warehouse_id,
        source=OrderSource.ADMIN,
        status="pending",
    )
    db_session.add(order)
    await db_session.flush()

    initial = SalesInitialInvoice(
        sales_order_id=order.id,
        invoice_number=invoice_number,
        status="CREATED",
    )
    db_session.add(initial)
    await db_session.commit()
    await db_session.refresh(order)
    await db_session.refresh(initial)
    return order, initial


async def _seed_employee(db_session, warehouse_id, role: EmployeeRole, name: str, phone: str):
    employee = Employee(
        warehouse_id=warehouse_id,
        full_name=name,
        name=name,
        role=role,
        phone=phone,
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)
    return employee


@pytest.mark.asyncio
async def test_packing_auto_assignment_uses_active_attendance(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)
    _order, initial = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-ASSIGN")

    task = PackingTask(sales_initial_invoice_id=initial.id, warehouse_id=warehouse.id, status="PENDING")
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    packer = await _seed_employee(db_session, warehouse.id, EmployeeRole.PACKER, "Packer S3", "9000000001")
    supervisor = await _seed_employee(db_session, warehouse.id, EmployeeRole.SUPERVISOR, "Supervisor S3", "9000000002")

    for employee in (packer, supervisor):
        r = await client.post(
            "/api/v1/packing/attendance",
            json={
                "employee_id": str(employee.id),
                "attendance_date": str(date.today()),
                "is_active_for_shift": True,
            },
        )
        assert r.status_code == 200

    assign_res = await client.post(
        "/api/v1/packing/assignments/auto",
        json={"warehouse_id": str(warehouse.id), "attendance_date": str(date.today())},
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["tasks_assigned"] == 1

    assigned_task = await db_session.get(PackingTask, task.id)
    assert assigned_task is not None
    assert assigned_task.assigned_packer_id == packer.id
    assert assigned_task.assigned_supervisor_id == supervisor.id

    rows = (await db_session.execute(select(AttendanceLog))).scalars().all()
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_packing_task_status_update_sets_label(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)
    _order, initial = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-STATUS")

    task = PackingTask(sales_initial_invoice_id=initial.id, warehouse_id=warehouse.id, status="PENDING")
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await client.patch(
        f"/api/v1/packing/tasks/{task.id}/status",
        json={"status": "READY_TO_DISPATCH", "pack_label": "PK-S3-001"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "READY_TO_DISPATCH"
    assert body["pack_label"] == "PK-S3-001"
    assert body["invoice_written_on_pack"] is True


@pytest.mark.asyncio
async def test_packing_ready_to_dispatch_requires_pack_label(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)
    _order, initial = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-LABEL")

    task = PackingTask(sales_initial_invoice_id=initial.id, warehouse_id=warehouse.id, status="ASSIGNED")
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await client.patch(
        f"/api/v1/packing/tasks/{task.id}/status",
        json={"status": "READY_TO_DISPATCH"},
    )
    assert r.status_code == 400
    assert "pack_label is required" in r.json()["detail"]


@pytest.mark.asyncio
async def test_packing_ready_to_dispatch_dashboard_and_sales_pending_dashboard(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)

    order_pending = SalesOrder(customer_id=customer.id, warehouse_id=warehouse.id, source=OrderSource.ADMIN, status="PENDING")
    db_session.add(order_pending)
    await db_session.flush()

    order_ready, initial_ready = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-DASH")
    task = PackingTask(
        sales_initial_invoice_id=initial_ready.id,
        warehouse_id=warehouse.id,
        status="READY_TO_DISPATCH",
        pack_label="PK-DASH-1",
        invoice_written_on_pack=True,
    )
    db_session.add(task)
    await db_session.commit()

    sales_dash = await client.get(f"/api/v1/sales/dashboard/pending-orders?warehouse_id={warehouse.id}")
    assert sales_dash.status_code == 200
    assert sales_dash.json()["count"] == 1
    assert sales_dash.json()["items"][0]["sales_order_id"] == str(order_pending.id)

    packing_dash = await client.get(f"/api/v1/packing/dashboard/ready-to-dispatch?warehouse_id={warehouse.id}")
    assert packing_dash.status_code == 200
    assert packing_dash.json()["count"] == 1
    assert packing_dash.json()["items"][0]["sales_order_id"] == str(order_ready.id)
    assert packing_dash.json()["items"][0]["pack_label"] == "PK-DASH-1"


@pytest.mark.asyncio
async def test_delivery_optimize_route_creates_stop_sequences(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)
    order_1, _ = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-D1")
    order_2, _ = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-D2")

    r = await client.post(
        "/api/v1/delivery/runs/optimize-route",
        json={
            "warehouse_id": str(warehouse.id),
            "run_date": str(date.today()),
            "sales_order_ids": [str(order_2.id), str(order_1.id)],
        },
    )
    assert r.status_code == 200
    assert r.json()["optimized"] is True
    run_id = r.json()["delivery_run_id"]

    run = await db_session.get(DeliveryRun, run_id)
    assert run is not None
    assert run.optimized is True

    stops = (
        await db_session.execute(
            select(DeliveryRunStop)
            .where(DeliveryRunStop.delivery_run_id == run.id)
            .order_by(DeliveryRunStop.stop_sequence.asc())
        )
    ).scalars().all()

    assert len(stops) == 2
    assert stops[0].stop_sequence == 1
    assert stops[0].reverse_load_sequence == 2
    assert stops[1].stop_sequence == 2
    assert stops[1].reverse_load_sequence == 1


@pytest.mark.asyncio
async def test_delivery_assign_team_and_capture_pod(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)
    order, _ = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-POD")

    run = DeliveryRun(warehouse_id=warehouse.id, run_date=date.today(), optimized=True)
    db_session.add(run)
    await db_session.flush()

    stop = DeliveryRunStop(
        delivery_run_id=run.id,
        sales_order_id=order.id,
        stop_sequence=1,
        reverse_load_sequence=1,
    )
    db_session.add(stop)
    await db_session.flush()

    driver = await _seed_employee(db_session, warehouse.id, EmployeeRole.DRIVER, "Driver S3", "9000000003")
    helper = await _seed_employee(db_session, warehouse.id, EmployeeRole.IN_VEHICLE_HELPER, "Helper S3", "9000000004")
    bill_manager = await _seed_employee(db_session, warehouse.id, EmployeeRole.BILL_MANAGER, "BillMgr S3", "9000000005")
    loader = await _seed_employee(db_session, warehouse.id, EmployeeRole.LOADER, "Loader S3", "9000000006")

    team_res = await client.post(
        "/api/v1/delivery/runs/assign-team",
        json={
            "delivery_run_id": str(run.id),
            "driver_id": str(driver.id),
            "helper_id": str(helper.id),
            "bill_manager_id": str(bill_manager.id),
            "loader_id": str(loader.id),
        },
    )
    assert team_res.status_code == 200
    assert team_res.json()["delivery_run_id"] == str(run.id)

    pod_res = await client.post(
        "/api/v1/delivery/stops/pod",
        json={
            "delivery_run_stop_id": str(stop.id),
            "status": "DELIVERED",
            "latitude": "15.5000000",
            "longitude": "78.5000000",
            "note": "Delivered with signature",
        },
    )
    assert pod_res.status_code == 200
    assert pod_res.json()["status"] == "DELIVERED"

    assignment_rows = (
        await db_session.execute(select(DeliveryAssignment).where(DeliveryAssignment.delivery_run_id == run.id))
    ).scalars().all()
    assert len(assignment_rows) == 1

    pod_rows = (await db_session.execute(select(PodEvent).where(PodEvent.delivery_run_stop_id == stop.id))).scalars().all()
    assert len(pod_rows) == 1
    assert pod_rows[0].note == "Delivered with signature"


@pytest.mark.asyncio
async def test_delivery_run_from_ready_tasks_and_role_validation(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)
    order, initial = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-RUNREADY")
    task = PackingTask(
        sales_initial_invoice_id=initial.id,
        warehouse_id=warehouse.id,
        status="READY_TO_DISPATCH",
        pack_label="PK-S3-RUN",
        invoice_written_on_pack=True,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    list_res = await client.get(f"/api/v1/delivery/runs/ready-to-dispatch?warehouse_id={warehouse.id}")
    assert list_res.status_code == 200
    assert list_res.json()["count"] == 1

    run_res = await client.post(
        "/api/v1/delivery/runs/from-ready",
        json={
            "warehouse_id": str(warehouse.id),
            "run_date": str(date.today()),
            "packing_task_ids": [str(task.id)],
        },
    )
    assert run_res.status_code == 200
    run_id = run_res.json()["delivery_run_id"]
    assert run_res.json()["optimized"] is True

    wrong_driver = await _seed_employee(db_session, warehouse.id, EmployeeRole.PACKER, "Wrong Driver", "9000000010")
    helper = await _seed_employee(db_session, warehouse.id, EmployeeRole.IN_VEHICLE_HELPER, "Helper S3A", "9000000011")
    bill_manager = await _seed_employee(db_session, warehouse.id, EmployeeRole.BILL_MANAGER, "BillMgr S3A", "9000000012")
    loader = await _seed_employee(db_session, warehouse.id, EmployeeRole.LOADER, "Loader S3A", "9000000013")

    bad_team = await client.post(
        "/api/v1/delivery/runs/assign-team",
        json={
            "delivery_run_id": run_id,
            "driver_id": str(wrong_driver.id),
            "helper_id": str(helper.id),
            "bill_manager_id": str(bill_manager.id),
            "loader_id": str(loader.id),
        },
    )
    assert bad_team.status_code == 400
    assert "driver_id must have role DRIVER" in bad_team.json()["detail"]


@pytest.mark.asyncio
async def test_delivery_run_summary_metrics(client, db_session):
    warehouse, customer = await _seed_warehouse_and_customer(db_session)
    order, _initial = await _seed_order_with_initial_invoice(db_session, warehouse.id, customer.id, "SI-S3-SUM")

    run = DeliveryRun(warehouse_id=warehouse.id, run_date=date.today(), optimized=True)
    db_session.add(run)
    await db_session.flush()

    stop_1 = DeliveryRunStop(
        delivery_run_id=run.id,
        sales_order_id=order.id,
        stop_sequence=1,
        reverse_load_sequence=2,
    )
    stop_2 = DeliveryRunStop(
        delivery_run_id=run.id,
        sales_order_id=order.id,
        stop_sequence=2,
        reverse_load_sequence=1,
    )
    db_session.add_all([stop_1, stop_2])
    await db_session.flush()

    driver = await _seed_employee(db_session, warehouse.id, EmployeeRole.DRIVER, "Driver Sum", "9000000020")
    helper = await _seed_employee(db_session, warehouse.id, EmployeeRole.IN_VEHICLE_HELPER, "Helper Sum", "9000000021")
    bill_manager = await _seed_employee(db_session, warehouse.id, EmployeeRole.BILL_MANAGER, "BillMgr Sum", "9000000022")
    loader = await _seed_employee(db_session, warehouse.id, EmployeeRole.LOADER, "Loader Sum", "9000000023")
    db_session.add(
        DeliveryAssignment(
            delivery_run_id=run.id,
            driver_id=driver.id,
            helper_id=helper.id,
            bill_manager_id=bill_manager.id,
            loader_id=loader.id,
        )
    )
    db_session.add(
        PodEvent(
            delivery_run_stop_id=stop_1.id,
            status="DELIVERED",
            latitude=Decimal("15.0000000"),
            longitude=Decimal("78.0000000"),
            note="Done",
        )
    )
    await db_session.commit()

    summary = await client.get(f"/api/v1/delivery/runs/{run.id}/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_stops"] == 2
    assert body["delivered_stops"] == 1
    assert body["pending_stops"] == 1
    assert body["team_assigned"] is True
