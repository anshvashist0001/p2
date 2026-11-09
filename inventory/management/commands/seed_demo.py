import os
import random
from datetime import timedelta
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from inventory.models import Product, Movement
from inventory.services import move, place_order, transition


class Command(BaseCommand):
    help = "Create a staff user and deterministic synthetic inventory data. Never resets existing records."

    @transaction.atomic
    def handle(self, *args, **options):
        password = os.environ.get("DEMO_PASSWORD")
        if not password:
            raise CommandError("Set DEMO_PASSWORD to create the demo user.")
        User = get_user_model()
        if not User.objects.filter(username="demo").exists():
            User.objects.create_user("demo", password=password, is_staff=True)
        if Product.objects.exists():
            self.stdout.write("Products already exist; skipped demo data.")
            return
        rng = random.Random(42)
        specs = [
            ("DSK-001", "Studio desk lamp", "Lighting", "2499.00", 86, 25, 4, 5),
            ("AUD-002", "Wireless headphones", "Electronics", "5999.00", 18, 30, 7, 7),
            ("BAG-003", "Everyday backpack", "Accessories", "3299.00", 124, 25, 5, 4),
            ("BOT-004", "Insulated water bottle", "Lifestyle", "899.00", 12, 40, 7, 9),
            ("KEY-005", "Mechanical keyboard", "Electronics", "7499.00", 62, 20, 6, 3),
            ("NTB-006", "Dotted notebook", "Stationery", "349.00", 210, 50, 3, 12),
            ("CHG-007", "USB-C charging hub", "Electronics", "2199.00", 0, 20, 8, 5),
            ("PLN-008", "Ceramic planter", "Home", "1299.00", 47, 15, 5, 2),
        ]
        for sku, name, category, price, target, point, lead, demand in specs:
            p = Product.objects.create(
                sku=sku,
                name=name,
                category=category,
                price=price,
                reorder_point=point,
                lead_time_days=lead,
            )
            amounts = [
                max(
                    1,
                    round(
                        demand
                        * (
                            1.35
                            if (timezone.localdate() - timedelta(days=90 - i)).weekday()
                            >= 5
                            else 1
                        )
                        + rng.gauss(0, 1.5)
                    ),
                )
                for i in range(90)
            ]
            if sku == "BOT-004":
                amounts[82] = 65
            move(
                p,
                sum(amounts) + target,
                "opening",
                "Synthetic demo opening balance",
                "demo-seed",
            )
            p.movements.update(created_at=timezone.now() - timedelta(days=91))
            for i, amount in enumerate(amounts):
                move(
                    p,
                    -amount,
                    "sale",
                    "Synthetic historical demand; not a customer order",
                    "demo-seed",
                )
                latest = p.movements.order_by("-pk").first()
                Movement.objects.filter(pk=latest.pk).update(
                    created_at=(timezone.now() - timedelta(days=90 - i)).replace(
                        hour=12, minute=0, second=0, microsecond=0
                    )
                )
        products = list(Product.objects.order_by("pk"))
        for i, customer in enumerate(
            [
                "Olivia Martin",
                "Arjun Shah",
                "Amelia Chen",
                "Liam Wilson",
                "Sophia Patel",
            ]
        ):
            product = products[i]
            order, _ = place_order(
                {
                    "key": f"demo-order-{i}",
                    "customer": customer,
                    "items": [{"product_id": product.pk, "quantity": 2}],
                },
                "demo-seed",
            )
            if i == 2:
                transition(order.pk, "shipped", "demo-seed")
            if i == 3:
                transition(order.pk, "cancelled", "demo-seed")
        self.stdout.write(
            self.style.SUCCESS(
                "Created 8 products and 90 days of explicitly synthetic demand."
            )
        )
