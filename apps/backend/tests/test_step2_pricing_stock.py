from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.entities import (
    AreaMaster,
    AuditLog,
    Customer,
    CustomerClass,
    CustomerProductPrice,
    InventoryBatch,
    OrderSource,
    Pricing,
    Product,
    RouteMaster,
    RouteProductPrice,
    SalesInitialInvoiceItem,
    SalesOrder,
    SalesOrderItem,
    Scheme,
    SchemeProduct,
    Warehouse,
)
from app.services.pricing import resolve_price_for_customer


async def _seed_sales_master(db_session):
    wh = Warehouse(code="WH-S2", name="WH Step2")
    area = AreaMaster(area_name="Area S2")
    db_session.add_all([wh, area])
    await db_session.flush()

    route = RouteMaster(route_name="Route S2", area_id=area.id)
    db_session.add(route)
    await db_session.flush()

    product = Product(sku="SKU-S2", name="Prod S2", unit="PCS", base_price=Decimal("100"), tax_percent=Decimal("5"))
    customer = Customer(name="Cust S2", customer_class=CustomerClass.B2C, route_id=route.id)
    db_session.add_all([product, customer])
    await db_session.commit()
    await db_session.refresh(wh)
    await db_session.refresh(route)
    await db_session.refresh(product)
    await db_session.refresh(customer)
    return wh, route, product, customer


@pytest.mark.asyncio
async def test_pricing_precedence_customer_override_wins(db_session):
    _wh, route, product, customer = await _seed_sales_master(db_session)

    db_session.add(Pricing(product_id=product.id, a_class_price=Decimal("80"), b_class_price=Decimal("70"), c_class_price=Decimal("90"), mrp=Decimal("120")))
    db_session.add(RouteProductPrice(route_id=route.id, product_id=product.id, price=Decimal("85"), is_active=True))
    db_session.add(CustomerProductPrice(customer_id=customer.id, product_id=product.id, price=Decimal("77"), is_active=True))
    await db_session.commit()

    price, source = await resolve_price_for_customer(db_session, customer, product)
    assert price == Decimal("77.0000")
    assert source == "CUSTOMER_OVERRIDE"


@pytest.mark.asyncio
async def test_pricing_precedence_scheme_used_when_no_class_or_override(db_session):
    _wh, _route, product, customer = await _seed_sales_master(db_session)

    scheme = Scheme(
        scheme_name="S2 Scheme",
        scheme_type="DISCOUNT",
        start_date=date(2020, 1, 1),
        end_date=date(2099, 1, 1),
        is_active=True,
    )
    db_session.add(scheme)
    await db_session.flush()
    db_session.add(SchemeProduct(scheme_id=scheme.id, product_id=product.id, discount_percent=Decimal("10")))
    await db_session.commit()

    price, source = await resolve_price_for_customer(db_session, customer, product)
    assert price == Decimal("90.0000")
    assert source == "SCHEME_PRICE"


@pytest.mark.asyncio
async def test_fefo_reservation_orders_by_expiry(client, db_session):
    wh, _route, product, customer = await _seed_sales_master(db_session)

    db_session.add_all(
        [
            InventoryBatch(
                warehouse_id=wh.id,
                product_id=product.id,
                batch_no="B2",
                expiry_date=date(2026, 2, 1),
                quantity_on_hand=Decimal("10"),
                available_quantity=Decimal("10"),
            ),
            InventoryBatch(
                warehouse_id=wh.id,
                product_id=product.id,
                batch_no="B1",
                expiry_date=date(2026, 1, 1),
                quantity_on_hand=Decimal("10"),
                available_quantity=Decimal("10"),
            ),
        ]
    )
    await db_session.flush()

    sales_order = SalesOrder(
        customer_id=customer.id,
        warehouse_id=wh.id,
        source=OrderSource.ADMIN,
        status="pending",
    )
    db_session.add(sales_order)
    await db_session.flush()
    db_session.add(SalesOrderItem(sales_order_id=sales_order.id, product_id=product.id, quantity=Decimal("12"), unit_price=Decimal("100")))
    await db_session.commit()

    r = await client.post(
        "/api/v1/sales/sales-initial-invoices",
        json={"sales_order_id": str(sales_order.id), "invoice_number": "SI-S2-FEFO"},
    )
    assert r.status_code == 200
    invoice_id = r.json()["id"]

    rows = (
        await db_session.execute(
            select(SalesInitialInvoiceItem)
            .where(SalesInitialInvoiceItem.sales_initial_invoice_id == invoice_id)
            .order_by(SalesInitialInvoiceItem.id.asc())
        )
    ).scalars().all()

    assert len(rows) == 2
    assert rows[0].batch_number == "B1"
    assert Decimal(rows[0].reserved_quantity) == Decimal("10")
    assert rows[1].batch_number == "B2"
    assert Decimal(rows[1].reserved_quantity) == Decimal("2")


@pytest.mark.asyncio
async def test_negative_override_requires_reason(client, db_session):
    wh, _route, product, customer = await _seed_sales_master(db_session)

    db_session.add(
        InventoryBatch(
            warehouse_id=wh.id,
            product_id=product.id,
            batch_no="B1",
            expiry_date=date(2026, 1, 1),
            quantity_on_hand=Decimal("1"),
            available_quantity=Decimal("1"),
        )
    )
    await db_session.flush()

    order = SalesOrder(customer_id=customer.id, warehouse_id=wh.id, source=OrderSource.ADMIN, status="pending")
    db_session.add(order)
    await db_session.flush()
    db_session.add(SalesOrderItem(sales_order_id=order.id, product_id=product.id, quantity=Decimal("5"), unit_price=Decimal("100")))
    await db_session.commit()

    r = await client.post(
        "/api/v1/sales/sales-initial-invoices",
        json={
            "sales_order_id": str(order.id),
            "invoice_number": "SI-S2-NO-REASON",
            "allow_negative_override": True,
        },
    )

    assert r.status_code == 400
    assert "override_reason is required" in r.json()["detail"]


@pytest.mark.asyncio
async def test_negative_override_writes_audit(client, db_session):
    wh, _route, product, customer = await _seed_sales_master(db_session)

    db_session.add(
        InventoryBatch(
            warehouse_id=wh.id,
            product_id=product.id,
            batch_no="B1",
            expiry_date=date(2026, 1, 1),
            quantity_on_hand=Decimal("1"),
            available_quantity=Decimal("1"),
        )
    )
    await db_session.flush()

    order = SalesOrder(customer_id=customer.id, warehouse_id=wh.id, source=OrderSource.ADMIN, status="pending")
    db_session.add(order)
    await db_session.flush()
    db_session.add(SalesOrderItem(sales_order_id=order.id, product_id=product.id, quantity=Decimal("5"), unit_price=Decimal("100")))
    await db_session.commit()

    r = await client.post(
        "/api/v1/sales/sales-initial-invoices",
        json={
            "sales_order_id": str(order.id),
            "invoice_number": "SI-S2-WITH-REASON",
            "allow_negative_override": True,
            "override_reason": "Urgent dispatch",
        },
    )

    assert r.status_code == 200

    audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "NEGATIVE_STOCK_OVERRIDE"))
    ).scalars().all()
    assert len(audit) >= 1
