from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Customer, Product, SalesOrder, SalesOrderItem, Scheme
from app.services.pricing import resolve_price_for_customer


def _quantize(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.0001"))


@dataclass
class PreviewLine:
    product_id: uuid.UUID
    sku: str
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    selling_price: Decimal
    discount_percent: Decimal | None = None
    is_free_item: bool = False


def _matches_scope(product: Product, scheme: Scheme) -> bool:
    if scheme.brand and (product.brand or "") != scheme.brand:
        return False
    if scheme.category and (product.category or "") != scheme.category:
        return False
    if scheme.sub_category and (product.sub_category or "") != scheme.sub_category:
        return False
    if scheme.product_id and product.id != scheme.product_id:
        return False
    return True


def _metric_for_scheme(
    scheme: Scheme,
    scoped_items: list[SalesOrderItem],
    product_by_id: dict[uuid.UUID, Product],
) -> Decimal:
    if scheme.condition_basis == "VALUE":
        total = Decimal("0")
        for item in scoped_items:
            total += Decimal(item.unit_price or 0) * Decimal(item.quantity or 0)
        return _quantize(total)

    if scheme.condition_basis == "WEIGHT":
        total_grams = Decimal("0")
        for item in scoped_items:
            product = product_by_id.get(item.product_id)
            if product is None or product.weight_in_grams is None:
                continue
            total_grams += Decimal(product.weight_in_grams) * Decimal(item.quantity or 0)
        if scheme.threshold_unit == "KG":
            return _quantize(total_grams / Decimal("1000"))
        return _quantize(total_grams)

    total_qty = Decimal("0")
    for item in scoped_items:
        total_qty += Decimal(item.quantity or 0)
    return _quantize(total_qty)


async def build_sales_order_preview(
    session: AsyncSession,
    *,
    customer: Customer,
    warehouse_id: uuid.UUID,
    items: list[tuple[uuid.UUID, Decimal]],
    at_date: date | None = None,
) -> list[PreviewLine]:
    current_date = at_date or date.today()
    aggregated_qty: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))

    existing_items_res = await session.execute(
        select(SalesOrderItem)
        .join(SalesOrder, SalesOrder.id == SalesOrderItem.sales_order_id)
        .where(
            SalesOrder.customer_id == customer.id,
            SalesOrder.warehouse_id == warehouse_id,
            SalesOrder.deleted_at.is_(None),
            SalesOrder.status == "pending",
            SalesOrderItem.is_bundle_child.is_(False),
        )
    )
    for existing_item in existing_items_res.scalars().all():
        aggregated_qty[existing_item.product_id] += Decimal(existing_item.quantity or 0)

    for product_id, quantity in items:
        if Decimal(quantity or 0) > 0:
            aggregated_qty[product_id] += Decimal(quantity)

    if not aggregated_qty:
        return []

    schemes: list[Scheme] = []
    reward_product_ids: set[uuid.UUID] = set()
    if customer.customer_category_id is not None:
        schemes_res = await session.execute(
            select(Scheme).where(
                and_(
                    Scheme.customer_category_id == customer.customer_category_id,
                    Scheme.is_active.is_(True),
                    Scheme.start_date <= current_date,
                    Scheme.end_date >= current_date,
                )
            )
        )
        schemes = schemes_res.scalars().all()
        reward_product_ids = {
            scheme.reward_product_id
            for scheme in schemes
            if scheme.reward_product_id is not None
        }

    product_ids = set(aggregated_qty.keys()) | reward_product_ids
    products_res = await session.execute(select(Product).where(Product.id.in_(product_ids)))
    product_by_id = {product.id: product for product in products_res.scalars().all()}

    base_lines: list[PreviewLine] = []
    for product_id, quantity in aggregated_qty.items():
        product = product_by_id.get(product_id)
        if product is None:
            continue
        unit_price, _source = await resolve_price_for_customer(session, customer, product, at_date=current_date)
        base_lines.append(
            PreviewLine(
                product_id=product.id,
                sku=product.sku,
                product_name=product.name,
                unit=product.unit,
                quantity=_quantize(quantity),
                unit_price=unit_price,
                selling_price=unit_price,
            )
        )

    if not schemes or not base_lines:
        return sorted(base_lines, key=lambda item: (item.is_free_item, item.product_name.lower(), item.sku.lower()))

    base_line_items = [
        SalesOrderItem(
            product_id=line.product_id,
            quantity=line.quantity,
            unit_price=line.unit_price,
            selling_price=line.selling_price,
            discount_percent=line.discount_percent,
        )
        for line in base_lines
    ]

    best_discount_by_product: dict[uuid.UUID, Decimal] = {}
    free_qty_by_product: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))

    for scheme in schemes:
        matching_items = [item for item in base_line_items if _matches_scope(product_by_id[item.product_id], scheme)]
        if not matching_items:
            continue

        achieved_metric = _metric_for_scheme(scheme, matching_items, product_by_id)
        if achieved_metric < Decimal(scheme.threshold_value or 0):
            continue

        if scheme.reward_type == "DISCOUNT" and scheme.reward_discount_percent is not None:
            reward_discount = Decimal(scheme.reward_discount_percent)
            for item in matching_items:
                current_best = best_discount_by_product.get(item.product_id, Decimal("0"))
                if reward_discount > current_best:
                    best_discount_by_product[item.product_id] = reward_discount
        elif scheme.reward_type == "FREE_ITEM" and scheme.reward_product_id and scheme.reward_product_quantity is not None:
            free_qty_by_product[scheme.reward_product_id] += Decimal(scheme.reward_product_quantity)

    for line in base_lines:
        discount_percent = best_discount_by_product.get(line.product_id)
        if discount_percent and discount_percent > 0:
            line.discount_percent = _quantize(discount_percent)
            line.selling_price = _quantize(line.unit_price * (Decimal("1") - (discount_percent / Decimal("100"))))

    free_lines: list[PreviewLine] = []
    for product_id, free_qty in free_qty_by_product.items():
        if free_qty <= 0:
            continue
        product = product_by_id.get(product_id)
        if product is None:
            continue
        free_lines.append(
            PreviewLine(
                product_id=product.id,
                sku=product.sku,
                product_name=product.name,
                unit=product.unit,
                quantity=_quantize(free_qty),
                unit_price=Decimal("0"),
                selling_price=Decimal("0"),
                discount_percent=Decimal("100"),
                is_free_item=True,
            )
        )

    return sorted(
        [*base_lines, *free_lines],
        key=lambda item: (item.is_free_item, item.product_name.lower(), item.sku.lower()),
    )


async def apply_schemes_to_sales_order(
    session: AsyncSession,
    sales_order: SalesOrder,
    customer: Customer,
    *,
    at_date: date | None = None,
) -> None:
    current_date = at_date or date.today()

    order_items_res = await session.execute(
        select(SalesOrderItem).where(SalesOrderItem.sales_order_id == sales_order.id)
    )
    all_order_items = order_items_res.scalars().all()
    base_items = [item for item in all_order_items if not item.is_bundle_child]
    free_items = [item for item in all_order_items if item.is_bundle_child]

    product_ids = {item.product_id for item in all_order_items}
    product_ids.update(
        row[0]
        for row in (
            await session.execute(
                select(Scheme.reward_product_id)
                .where(
                    Scheme.customer_category_id == customer.customer_category_id,
                    Scheme.is_active.is_(True),
                    Scheme.start_date <= current_date,
                    Scheme.end_date >= current_date,
                    Scheme.reward_product_id.is_not(None),
                )
            )
        ).all()
        if row[0] is not None
    )

    product_by_id: dict[uuid.UUID, Product] = {}
    if product_ids:
        products_res = await session.execute(select(Product).where(Product.id.in_(product_ids)))
        product_by_id = {product.id: product for product in products_res.scalars().all()}

    for item in base_items:
        product = product_by_id.get(item.product_id)
        if product is None:
            continue
        unit_price, _source = await resolve_price_for_customer(session, customer, product)
        item.unit_price = unit_price
        item.discount_percent = None
        item.selling_price = unit_price

    if customer.customer_category_id is None or not base_items:
        for free_item in free_items:
            await session.delete(free_item)
        return

    schemes_res = await session.execute(
        select(Scheme).where(
            and_(
                Scheme.customer_category_id == customer.customer_category_id,
                Scheme.is_active.is_(True),
                Scheme.start_date <= current_date,
                Scheme.end_date >= current_date,
            )
        )
    )
    schemes = schemes_res.scalars().all()

    best_discount_by_product: dict[uuid.UUID, Decimal] = {}
    free_qty_by_product: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))

    for scheme in schemes:
        matching_items = [item for item in base_items if _matches_scope(product_by_id[item.product_id], scheme)]
        if not matching_items:
            continue

        achieved_metric = _metric_for_scheme(scheme, matching_items, product_by_id)
        if achieved_metric < Decimal(scheme.threshold_value or 0):
            continue

        if scheme.reward_type == "DISCOUNT" and scheme.reward_discount_percent is not None:
            reward_discount = Decimal(scheme.reward_discount_percent)
            for item in matching_items:
                current_best = best_discount_by_product.get(item.product_id, Decimal("0"))
                if reward_discount > current_best:
                    best_discount_by_product[item.product_id] = reward_discount
        elif scheme.reward_type == "FREE_ITEM" and scheme.reward_product_id and scheme.reward_product_quantity is not None:
            free_qty_by_product[scheme.reward_product_id] += Decimal(scheme.reward_product_quantity)

    for item in base_items:
        discount_percent = best_discount_by_product.get(item.product_id)
        if discount_percent and discount_percent > 0:
            item.discount_percent = _quantize(discount_percent)
            item.selling_price = _quantize(Decimal(item.unit_price or 0) * (Decimal("1") - (discount_percent / Decimal("100"))))

    existing_free_items = {item.product_id: item for item in free_items}
    desired_free_product_ids = set(free_qty_by_product.keys())

    for free_item in free_items:
        if free_item.product_id not in desired_free_product_ids:
            await session.delete(free_item)

    for product_id, free_qty in free_qty_by_product.items():
        if free_qty <= 0:
            continue
        existing = existing_free_items.get(product_id)
        if existing is None:
            session.add(
                SalesOrderItem(
                    sales_order_id=sales_order.id,
                    product_id=product_id,
                    quantity=_quantize(free_qty),
                    unit_price=Decimal("0"),
                    selling_price=Decimal("0"),
                    discount_percent=Decimal("100"),
                    is_bundle_parent=False,
                    is_bundle_child=True,
                )
            )
        else:
            existing.quantity = _quantize(free_qty)
            existing.unit_price = Decimal("0")
            existing.selling_price = Decimal("0")
            existing.discount_percent = Decimal("100")
            existing.is_bundle_child = True
            existing.is_bundle_parent = False
