from django.db import models
from django.db.models import Q


class Product(models.Model):
    sku = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=60, default="General")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.PositiveIntegerField(default=0)
    reorder_point = models.PositiveIntegerField(default=20)
    lead_time_days = models.PositiveIntegerField(default=7)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(price__gte=0), name="nonnegative_price"),
            models.CheckConstraint(
                condition=Q(lead_time_days__gte=1), name="positive_lead_time"
            ),
        ]


class Order(models.Model):
    key = models.CharField(max_length=100, unique=True)
    fingerprint = models.CharField(max_length=64)
    customer = models.CharField(max_length=120)
    status = models.CharField(
        max_length=20,
        default="pending",
        choices=[(s, s) for s in ["pending", "confirmed", "shipped", "cancelled"]],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="positive_order_quantity"
            ),
            models.UniqueConstraint(
                fields=["order", "product"], name="one_product_per_order"
            ),
        ]


class Movement(models.Model):
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="movements"
    )
    order = models.ForeignKey(Order, null=True, on_delete=models.PROTECT)
    delta = models.IntegerField()
    kind = models.CharField(
        max_length=20,
        choices=[
            (s, s) for s in ["opening", "receipt", "sale", "cancellation", "count"]
        ],
    )
    note = models.CharField(max_length=240)
    actor = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)


class ReconciliationAudit(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    before = models.IntegerField()
    after = models.IntegerField()
    actor = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)
