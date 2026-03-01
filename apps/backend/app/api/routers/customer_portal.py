import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.auth import require_customer_portal
from app.db.session import get_db
from app.models.entities import Customer, Payment, Product, SalesOrder, SalesOrderItem
from app.schemas.auth import AuthUserInfo
from app.schemas.customer_portal import (
    CustomerOrderHistoryItem,
    CustomerOrderLineItem,
    CustomerPaymentHistoryItem,
    CustomerProfileResponse,
)

router = APIRouter()


def _assert_customer_identity(auth: AuthUserInfo, customer_id: uuid.UUID) -> None:
    if auth.customer_id != str(customer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access denied")


@router.get("/customers/{customer_id}/profile", response_model=CustomerProfileResponse)
async def customer_profile(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_customer_portal),
):
    _assert_customer_identity(auth, customer_id)
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return {
        "id": customer.id,
        "name": customer.name,
        "outlet_name": customer.outlet_name,
        "whatsapp_number": customer.whatsapp_number or customer.phone,
        "alternate_number": customer.alternate_number,
        "pan_number": customer.pan_number,
        "pan_doc": customer.pan_doc,
        "gst_number": customer.gst_number or customer.gstin,
        "gst_doc": customer.gst_doc,
        "email": customer.email,
        "route_id": customer.route_id,
        "customer_type": customer.customer_type.value if hasattr(customer.customer_type, "value") else str(customer.customer_type),
        "customer_class": customer.customer_class.value if hasattr(customer.customer_class, "value") else str(customer.customer_class),
        "credit_limit": customer.credit_limit,
        "current_balance": customer.current_balance,
    }


@router.get("/customers/{customer_id}/orders", response_model=list[CustomerOrderHistoryItem])
async def customer_orders(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_customer_portal),
):
    _assert_customer_identity(auth, customer_id)
    rows = (
        await db.execute(
            select(
                SalesOrder.id,
                SalesOrder.challan_date,
                SalesOrder.source,
                SalesOrder.status,
                func.coalesce(func.sum(SalesOrderItem.quantity * SalesOrderItem.unit_price), Decimal("0")),
            )
            .outerjoin(SalesOrderItem, SalesOrderItem.sales_order_id == SalesOrder.id)
            .where(SalesOrder.customer_id == customer_id)
            .group_by(SalesOrder.id)
            .order_by(SalesOrder.created_at.desc())
        )
    ).all()
    return [
        {
            "sales_order_id": row[0],
            "order_date": row[1],
            "source": row[2].value if hasattr(row[2], "value") else str(row[2]),
            "status": row[3],
            "total": Decimal(row[4]),
        }
        for row in rows
    ]


@router.get("/customers/{customer_id}/orders/{sales_order_id}/items", response_model=list[CustomerOrderLineItem])
async def customer_order_items(
    customer_id: uuid.UUID,
    sales_order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_customer_portal),
):
    _assert_customer_identity(auth, customer_id)
    rows = (
        await db.execute(
            select(
                SalesOrderItem.id,
                Product.sku,
                Product.name,
                Product.unit,
                SalesOrderItem.quantity,
                SalesOrderItem.unit_price,
            )
            .join(SalesOrder, SalesOrder.id == SalesOrderItem.sales_order_id)
            .join(Product, Product.id == SalesOrderItem.product_id)
            .where(SalesOrder.customer_id == customer_id)
            .where(SalesOrder.id == sales_order_id)
            .order_by(Product.name.asc())
        )
    ).all()
    return [
        {
            "sales_order_item_id": row[0],
            "sku": row[1] or "",
            "product_name": row[2] or "",
            "unit": row[3] or "",
            "quantity": Decimal(row[4] or 0),
            "unit_price": Decimal(row[5] or 0),
        }
        for row in rows
    ]


@router.get("/customers/{customer_id}/payments", response_model=list[CustomerPaymentHistoryItem])
async def customer_payments(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthUserInfo = Depends(require_customer_portal),
):
    _assert_customer_identity(auth, customer_id)
    rows = (
        await db.execute(
            select(Payment.id, Payment.payment_date, Payment.mode, Payment.amount)
            .where(Payment.customer_id == customer_id)
            .order_by(Payment.created_at.desc())
        )
    ).all()
    return [
        {"payment_id": row[0], "payment_date": row[1], "mode": row[2], "amount": Decimal(row[3])}
        for row in rows
    ]
