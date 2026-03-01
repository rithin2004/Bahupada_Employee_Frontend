from types import SimpleNamespace

import pytest
from jose import jwt
from sqlalchemy import select

from app.api.routers import delivery as delivery_router
from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.entities import Customer, CustomerClass, Product, User, Warehouse


@pytest.mark.asyncio
async def test_auth_login_success_and_refresh_flow(client, db_session):
    user = User(
        email="auth1@example.com",
        phone="9111111111",
        password_hash=hash_password("pass123"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    login_res = await client.post("/api/v1/auth/login", json={"username": "auth1@example.com", "password": "pass123"})
    assert login_res.status_code == 200
    tokens = login_res.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["access_token"]
    assert tokens["refresh_token"]

    refresh_res = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_res.status_code == 200
    refreshed = refresh_res.json()
    assert refreshed["access_token"] != ""
    assert refreshed["refresh_token"] != ""


@pytest.mark.asyncio
async def test_auth_login_wrong_password_locks_after_threshold(client, db_session):
    user = User(
        email="auth2@example.com",
        phone="9222222222",
        password_hash=hash_password("pass123"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    for _ in range(5):
        res = await client.post("/api/v1/auth/login", json={"username": "auth2@example.com", "password": "wrong-pass"})
        assert res.status_code == 401

    db_user = (await db_session.execute(select(User).where(User.email == "auth2@example.com"))).scalar_one()
    assert db_user.failed_login_attempts == 5
    assert db_user.locked_until is not None

    locked_res = await client.post("/api/v1/auth/login", json={"username": "auth2@example.com", "password": "pass123"})
    assert locked_res.status_code == 423


@pytest.mark.asyncio
async def test_auth_refresh_rejects_access_token(client):
    access = create_access_token("subject-1")
    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert res.status_code == 401
    assert "Invalid token type" in res.json()["detail"]


@pytest.mark.asyncio
async def test_auth_logout_endpoint(client):
    res = await client.post("/api/v1/auth/logout")
    assert res.status_code == 200
    assert res.json()["message"] == "Logged out"


@pytest.mark.asyncio
async def test_masters_products_pagination_contract(client, db_session):
    for i in range(5):
        db_session.add(
            Product(
                sku=f"SKU-S5-{i}",
                name=f"Product S5 {i}",
                unit="PCS",
                base_price="10.00",
                tax_percent="5.00",
            )
        )
    await db_session.commit()

    res = await client.get("/api/v1/masters/products?page=1&page_size=2")
    assert res.status_code == 200
    body = res.json()
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_masters_customers_and_warehouses_pagination(client, db_session):
    for i in range(3):
        db_session.add(Customer(name=f"Customer S5 {i}", customer_class=CustomerClass.B2C))
        db_session.add(Warehouse(code=f"WH-S5-{i}", name=f"Warehouse S5 {i}"))
    await db_session.commit()

    c_res = await client.get("/api/v1/masters/customers?page=1&page_size=2")
    w_res = await client.get("/api/v1/masters/warehouses?page=2&page_size=2")

    assert c_res.status_code == 200
    assert w_res.status_code == 200
    assert c_res.json()["total"] == 3
    assert len(c_res.json()["items"]) == 2
    assert w_res.json()["total"] == 3
    assert w_res.json()["page"] == 2
    assert len(w_res.json()["items"]) == 1


@pytest.mark.asyncio
async def test_masters_page_size_validation(client):
    res = await client.get(f"/api/v1/masters/products?page=1&page_size={settings.pagination_max_page_size + 1}")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_delivery_async_optimize_and_task_status_contract(client, monkeypatch):
    class _DummyTask:
        id = "task-123"

    monkeypatch.setattr(
        delivery_router.optimize_delivery_route_task,
        "delay",
        lambda **kwargs: _DummyTask(),
    )

    async_res_pending = SimpleNamespace(id="task-123", state="PENDING", info=None)
    async_res_success = SimpleNamespace(id="task-123", state="SUCCESS", info=None, result={"delivery_run_id": "abc"})
    async_res_fail = SimpleNamespace(id="task-123", state="FAILURE", info="boom")

    # async optimize kick-off
    run_res = await client.post(
        "/api/v1/delivery/runs/optimize-route/async",
        json={
            "warehouse_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "run_date": "2026-01-01",
            "sales_order_ids": ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
        },
    )
    assert run_res.status_code == 200
    assert run_res.json()["task_id"] == "task-123"
    assert run_res.json()["status"] == "PROCESSING"

    monkeypatch.setattr(delivery_router, "AsyncResult", lambda task_id, app: async_res_pending)
    pending_res = await client.get("/api/v1/delivery/tasks/task-123")
    assert pending_res.status_code == 200
    assert pending_res.json()["status"] == "PROCESSING"

    monkeypatch.setattr(delivery_router, "AsyncResult", lambda task_id, app: async_res_success)
    success_res = await client.get("/api/v1/delivery/tasks/task-123")
    assert success_res.status_code == 200
    assert success_res.json()["status"] == "COMPLETED"

    monkeypatch.setattr(delivery_router, "AsyncResult", lambda task_id, app: async_res_fail)
    fail_res = await client.get("/api/v1/delivery/tasks/task-123")
    assert fail_res.status_code == 200
    assert fail_res.json()["status"] == "FAILED"


@pytest.mark.asyncio
async def test_access_token_claims_shape(client, db_session):
    user = User(
        email="auth3@example.com",
        phone="9333333333",
        password_hash=hash_password("pass123"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    login_res = await client.post("/api/v1/auth/login", json={"username": "auth3@example.com", "password": "pass123"})
    assert login_res.status_code == 200
    access = login_res.json()["access_token"]
    payload = jwt.decode(access, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])

    assert payload["type"] == "access"
    assert payload["sub"] == str(user.id)
    assert "iat" in payload
    assert "exp" in payload
