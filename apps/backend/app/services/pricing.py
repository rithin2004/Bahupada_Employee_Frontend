from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    Customer,
    CustomerCategory,
    CustomerClass,
    CustomerType,
    CustomerProductPrice,
    Pricing,
    Product,
    RouteProductPrice,
)


def _quantize(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.0001"))


async def resolve_price_for_customer(
    session: AsyncSession,
    customer: Customer,
    product: Product,
    at_date: date | None = None,
) -> tuple[Decimal, str]:
    pricing_row = (
        await session.execute(select(Pricing).where(Pricing.product_id == product.id, Pricing.is_active.is_(True)))
    ).scalar_one_or_none()

    customer_override = (
        await session.execute(
            select(CustomerProductPrice).where(
                CustomerProductPrice.customer_id == customer.id,
                CustomerProductPrice.product_id == product.id,
                CustomerProductPrice.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if customer_override is not None:
        return _quantize(customer_override.price), "CUSTOMER_OVERRIDE"

    if customer.route_id is not None:
        route_override = (
            await session.execute(
                select(RouteProductPrice).where(
                    RouteProductPrice.route_id == customer.route_id,
                    RouteProductPrice.product_id == product.id,
                    RouteProductPrice.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if route_override is not None:
            return _quantize(route_override.price), "ROUTE_OVERRIDE"

    class_price: Decimal | None = None
    if pricing_row is not None:
        resolved_price_class: str | None = None
        if customer.customer_category_id is not None:
            category = await session.get(CustomerCategory, customer.customer_category_id)
            if category is not None and category.is_active:
                resolved_price_class = str(category.price_class or "").upper()

        if resolved_price_class is None:
            # Defaults when category is not mapped.
            resolved_price_class = "C" if customer.customer_type == CustomerType.B2C else "A"

        if resolved_price_class == "B":
            class_price = pricing_row.b_class_price
        elif resolved_price_class == "C":
            class_price = pricing_row.c_class_price
        else:
            class_price = pricing_row.a_class_price

        # Backward compatibility while older data still uses customer_class.
        if class_price is None:
            if customer.customer_class == CustomerClass.B2B_DISTRIBUTOR:
                class_price = pricing_row.b_class_price
            elif customer.customer_class in {
                CustomerClass.B2B_SEMI_WHOLESALE,
                CustomerClass.B2B_TOP_OUTLET,
                CustomerClass.B2B_MASS_GROCERY,
            }:
                class_price = pricing_row.a_class_price
            elif customer.customer_class == CustomerClass.B2C:
                class_price = pricing_row.c_class_price

    if class_price is not None and Decimal(class_price) > 0:
        return _quantize(class_price), "CLASS_PRICE"

    if pricing_row is not None and Decimal(pricing_row.mrp) > 0:
        return _quantize(pricing_row.mrp), "MRP_BASE"

    return _quantize(product.base_price), "PRODUCT_BASE"
