import hashlib
import json
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from .models import Product, Order, OrderItem, Movement, ReconciliationAudit


class Conflict(ValueError):
    pass


def integer(value, name, minimum=0, maximum=1_000_000):
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not minimum <= value <= maximum
    ):
        raise ValueError(f"{name} must be an integer between {minimum} and {maximum}.")
    return value


def label(value, name, limit=120):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f"{name} is required (maximum {limit} characters).")
    return value.strip()


def move(product, delta, kind, note, actor, order=None):
    """Update the counter and ledger together; callers hold the product lock."""
    product.stock += delta
    if product.stock < 0:
        raise Conflict(f"Not enough stock for {product.name}.")
    product.save(update_fields=["stock"])
    Movement.objects.create(
        product=product, delta=delta, kind=kind, note=note, actor=actor, order=order
    )


@transaction.atomic
def place_order(data, actor):
    customer = label(data.get("customer"), "Customer")
    key = label(data.get("key"), "Idempotency key", 100)
    raw = data.get("items")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 100:
        raise ValueError("An order needs 1–100 line items.")
    quantities = {}
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Invalid line item.")
        pk = integer(item.get("product_id"), "Product ID", 1)
        quantities[pk] = quantities.get(pk, 0) + integer(
            item.get("quantity"), "Quantity", 1
        )
        integer(quantities[pk], "Combined quantity", 1)
    fingerprint = hashlib.sha256(
        json.dumps([customer, sorted(quantities.items())]).encode()
    ).hexdigest()
    order, created = Order.objects.get_or_create(
        key=key, defaults={"customer": customer, "fingerprint": fingerprint}
    )
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.fingerprint != fingerprint:
        raise Conflict("This request key was already used for a different order.")
    if not created:
        return order, False
    # Consistent lock order avoids deadlocks between overlapping orders.
    products = list(
        Product.objects.select_for_update().filter(pk__in=quantities).order_by("pk")
    )
    if len(products) != len(quantities):
        raise ValueError("One or more products no longer exist.")
    for product in products:
        qty = quantities[product.pk]
        if product.stock < qty:
            raise Conflict(f"{product.name}: only {product.stock} units available.")
        OrderItem.objects.create(
            order=order, product=product, quantity=qty, unit_price=product.price
        )
        move(product, -qty, "sale", f"Order #{order.pk}", actor, order)
    order.status = "confirmed"
    order.save(update_fields=["status"])
    return order, True


@transaction.atomic
def transition(pk, target, actor):
    order = Order.objects.select_for_update().get(pk=pk)
    if order.status == target:
        return order
    if order.status != "confirmed":
        raise Conflict(f"A {order.status} order cannot be {target}.")
    if target == "cancelled":
        items = {i.product_id: i.quantity for i in order.items.all()}
        for product in (
            Product.objects.select_for_update().filter(pk__in=items).order_by("pk")
        ):
            move(
                product,
                items[product.pk],
                "cancellation",
                f"Cancelled order #{order.pk}",
                actor,
                order,
            )
        order.cancelled_at = timezone.now()
    order.status = target
    order.save(update_fields=["status", "cancelled_at"])
    return order


@transaction.atomic
def adjust_stock(pk, data, actor):
    product = Product.objects.select_for_update().get(pk=pk)
    expected = integer(data.get("expected_stock"), "Expected stock")
    if product.stock != expected:
        raise Conflict(
            "Stock changed since you opened this form. Refresh and try again."
        )
    quantity = integer(data.get("quantity"), "Quantity")
    note = label(data.get("note"), "Reason", 240)
    kind = data.get("kind")
    if kind not in ["receipt", "count"]:
        raise ValueError("Choose a receipt or physical count.")
    if kind == "receipt" and quantity == 0:
        raise ValueError("Receipt quantity must be positive.")
    delta = quantity if kind == "receipt" else quantity - product.stock
    move(product, delta, kind, note, actor)
    return product


@transaction.atomic
def reconcile(repair_pk=None, actor="", expected_stock=None, expected_ledger=None):
    # Writers lock the same products, so ledger totals cannot change mid-check.
    products = Product.objects.select_for_update().order_by("pk")
    if repair_pk is not None:
        products = products.filter(pk=repair_pk)
    products = list(products)
    if repair_pk is not None and not products:
        raise Product.DoesNotExist
    totals = dict(
        Movement.objects.filter(product__in=products)
        .values("product_id")
        .annotate(total=Sum("delta"))
        .values_list("product_id", "total")
    )
    rows = []
    for product in products:
        ledger = totals.get(product.pk, 0)
        rows.append(
            {
                "id": product.pk,
                "sku": product.sku,
                "name": product.name,
                "recorded": product.stock,
                "ledger": ledger,
                "difference": product.stock - ledger,
            }
        )
        if repair_pk is not None:
            if product.stock != expected_stock or ledger != expected_ledger:
                raise Conflict(
                    "Inventory changed. Run reconciliation again before repairing."
                )
            if ledger < 0:
                raise Conflict("Negative ledger balance requires manual investigation.")
            if product.stock != ledger:
                ReconciliationAudit.objects.create(
                    product=product, before=product.stock, after=ledger, actor=actor
                )
                product.stock = ledger
                product.save(update_fields=["stock"])
    return rows
