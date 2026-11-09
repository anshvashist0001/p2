from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.test import TestCase, TransactionTestCase, Client
from django.contrib.auth import get_user_model
from django.db import connection, close_old_connections
from django.db.models import Sum
from .models import Product, Order, Movement, ReconciliationAudit
from .services import place_order, transition, move, adjust_stock, reconcile, Conflict
from .intelligence import forecast, anomalies
from datetime import timedelta
from django.utils import timezone


def product(stock=10, sku="TEST-1"):
    p = Product.objects.create(sku=sku, name="Test product", price="10.00")
    move(p, stock, "opening", "Test opening", "test")
    return p


def payload(p, key="test-order", quantity=1):
    return {
        "key": key,
        "customer": "Test customer",
        "items": [{"product_id": p.pk, "quantity": quantity}],
    }


class InventoryTests(TestCase):
    def setUp(self):
        self.p = product()

    def test_placement_deducts_stock_and_ledger(self):
        order, created = place_order(payload(self.p, quantity=4), "test")
        self.p.refresh_from_db()
        self.assertTrue(created)
        self.assertEqual(self.p.stock, 6)
        self.assertEqual(
            Movement.objects.filter(product=self.p).aggregate(n=Sum("delta"))["n"], 6
        )
        self.assertEqual(order.status, "confirmed")

    def test_insufficient_multiline_order_rolls_back_everything(self):
        other = product(0, "EMPTY")
        data = payload(self.p, quantity=5)
        data["items"].append({"product_id": other.pk, "quantity": 1})
        with self.assertRaises(Conflict):
            place_order(data, "test")
        self.p.refresh_from_db()
        self.assertEqual(self.p.stock, 10)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(Movement.objects.filter(kind="sale").count(), 0)

    def test_duplicate_request_is_idempotent_and_payload_mismatch_rejected(self):
        first, _ = place_order(payload(self.p), "test")
        second, created = place_order(payload(self.p), "test")
        self.assertEqual(first.pk, second.pk)
        self.assertFalse(created)
        with self.assertRaises(Conflict):
            place_order(payload(self.p, quantity=2), "test")
        self.p.refresh_from_db()
        self.assertEqual(self.p.stock, 9)

    def test_cancellation_restores_once_and_retry_does_not_reorder(self):
        o, _ = place_order(payload(self.p, quantity=3), "test")
        transition(o.pk, "cancelled", "test")
        transition(o.pk, "cancelled", "test")
        retried, created = place_order(payload(self.p, quantity=3), "test")
        self.assertFalse(created)
        self.assertEqual(retried.status, "cancelled")
        self.p.refresh_from_db()
        self.assertEqual(self.p.stock, 10)
        self.assertEqual(Movement.objects.filter(kind="cancellation").count(), 1)

    def test_shipped_order_cannot_be_cancelled(self):
        o, _ = place_order(payload(self.p), "test")
        transition(o.pk, "shipped", "test")
        with self.assertRaises(Conflict):
            transition(o.pk, "cancelled", "test")

    def test_duplicate_lines_are_combined(self):
        d = payload(self.p, quantity=6)
        d["items"].append({"product_id": self.p.pk, "quantity": 5})
        with self.assertRaises(Conflict):
            place_order(d, "test")
        self.p.refresh_from_db()
        self.assertEqual(self.p.stock, 10)

    def test_invalid_quantities_rejected(self):
        for qty in [0, -1, 1.5, True, "2", None]:
            with self.subTest(qty=qty), self.assertRaises(ValueError):
                place_order(payload(self.p, quantity=qty), "test")

    def test_count_and_receipt_ledger_and_stale_count(self):
        adjust_stock(
            self.p.pk,
            {
                "kind": "receipt",
                "quantity": 5,
                "expected_stock": 10,
                "note": "Delivery",
            },
            "test",
        )
        with self.assertRaises(Conflict):
            adjust_stock(
                self.p.pk,
                {
                    "kind": "count",
                    "quantity": 9,
                    "expected_stock": 10,
                    "note": "Old count",
                },
                "test",
            )
        adjust_stock(
            self.p.pk,
            {
                "kind": "count",
                "quantity": 9,
                "expected_stock": 15,
                "note": "Physical count",
            },
            "test",
        )
        self.assertEqual(reconcile()[0]["difference"], 0)
        self.assertEqual(reconcile()[0]["recorded"], 9)

    def test_discrepancy_detected_repaired_and_audited(self):
        Product.objects.filter(pk=self.p.pk).update(stock=15)
        row = reconcile()[0]
        self.assertEqual(row["difference"], 5)
        reconcile(self.p.pk, "test", 15, 10)
        self.assertEqual(reconcile()[0]["difference"], 0)
        self.assertEqual(ReconciliationAudit.objects.get().before, 15)
        self.assertEqual(Movement.objects.count(), 1)

    def test_stale_repair_rejected(self):
        with self.assertRaises(Conflict):
            reconcile(self.p.pk, "test", 12, 10)

    def test_ml_cold_start_is_explicit(self):
        self.assertFalse(forecast(self.p)["ready"])
        self.assertFalse(anomalies()["ready"])

    def test_forecast_trains_evaluates_and_excludes_today(self):
        for i in range(1, 51):
            m = Movement.objects.create(
                product=self.p,
                delta=-(3 + i % 4),
                kind="sale",
                note="Synthetic test",
                actor="test",
            )
            Movement.objects.filter(pk=m.pk).update(
                created_at=timezone.now() - timedelta(days=i)
            )
        result = forecast(self.p)
        self.assertTrue(result["ready"])
        self.assertEqual(len(result["forecast"]), 14)
        self.assertGreaterEqual(result["mae"], 0)
        self.assertGreaterEqual(result["baseline_mae"], 0)
        Movement.objects.create(
            product=self.p,
            delta=-10000,
            kind="sale",
            note="Incomplete today",
            actor="test",
        )
        self.assertEqual(forecast(self.p), result)

    def test_anomaly_review_finds_synthetic_large_sale(self):
        for _ in range(40):
            Movement.objects.create(
                product=self.p,
                delta=-2,
                kind="sale",
                note="Synthetic test",
                actor="test",
            )
        outlier = Movement.objects.create(
            product=self.p,
            delta=-100,
            kind="sale",
            note="Synthetic outlier",
            actor="test",
        )
        result = anomalies()
        self.assertTrue(result["ready"])
        self.assertIn(outlier.pk, [r["id"] for r in result["items"]])


class APITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "staff", password="test-password", is_staff=True
        )

    def test_requires_staff_authentication(self):
        self.assertEqual(self.client.get("/api/products").status_code, 401)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get("/api/products").status_code, 200)

    def test_csrf_is_required_even_for_login(self):
        c = Client(enforce_csrf_checks=True)
        self.assertEqual(
            c.post(
                "/api/login",
                data={"username": "staff", "password": "test-password"},
                content_type="application/json",
            ).status_code,
            403,
        )
        token = c.get("/api/session").json()["csrf"]
        self.assertEqual(
            c.post(
                "/api/login",
                data={"username": "staff", "password": "test-password"},
                content_type="application/json",
                HTTP_X_CSRFTOKEN=token,
            ).status_code,
            200,
        )

    def test_api_product_validation_and_duplicate_sku(self):
        self.client.force_login(self.user)
        data = {"name": "Lamp", "sku": "LAMP", "price": "5.00", "stock": 4}
        self.assertEqual(
            self.client.post(
                "/api/products", data=data, content_type="application/json"
            ).status_code,
            201,
        )
        self.assertEqual(
            self.client.post(
                "/api/products", data=data, content_type="application/json"
            ).status_code,
            409,
        )
        data["price"] = "NaN"
        self.assertEqual(
            self.client.post(
                "/api/products", data=data, content_type="application/json"
            ).status_code,
            400,
        )

    def test_api_order_cancellation_and_stock_adjustment_workflow(self):
        self.client.force_login(self.user)
        p = product(6)
        response = self.client.post(
            "/api/orders", data=payload(p, quantity=2), content_type="application/json"
        )
        self.assertEqual(response.status_code, 201)
        order = response.json()
        self.assertEqual(order["total"], "20.00")
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order['id']}/cancel",
                data={},
                content_type="application/json",
            ).status_code,
            200,
        )
        response = self.client.post(
            f"/api/products/{p.pk}/adjust",
            data={
                "kind": "receipt",
                "quantity": 3,
                "expected_stock": 6,
                "note": "API delivery",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stock"], 9)
        rows = self.client.get("/api/reconciliation").json()["items"]
        self.assertEqual(rows[0]["difference"], 0)


@skipUnless(
    connection.vendor == "postgresql",
    "Requires PostgreSQL row locks; SQLite is not a valid substitute.",
)
class ConcurrencyTests(TransactionTestCase):
    def race(self, count, fn):
        barrier = Barrier(count)

        def worker(i):
            close_old_connections()
            try:
                barrier.wait(timeout=20)
                return fn(i)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=count) as pool:
            return list(pool.map(worker, range(count)))

    def test_twenty_buyers_compete_for_five_units(self):
        p = product(5)

        def buy(i):
            try:
                place_order(payload(p, key=f"buyer-{i}"), "race-test")
                return "confirmed"
            except Conflict:
                return "rejected"

        outcomes = self.race(20, buy)
        self.assertEqual(outcomes.count("confirmed"), 5)
        self.assertEqual(outcomes.count("rejected"), 15)
        p.refresh_from_db()
        self.assertEqual(p.stock, 0)
        self.assertEqual(
            Movement.objects.filter(product=p).aggregate(n=Sum("delta"))["n"], 0
        )
        self.assertEqual(Order.objects.count(), 5)
        print(
            "\nMEASURED: 20 simultaneous buyers, 5 units: 5 confirmed, 15 rejected, final stock 0, ledger 0."
        )

    def test_simultaneous_duplicate_requests_create_one_order(self):
        p = product(5)
        results = self.race(8, lambda i: place_order(payload(p), "race-test")[0].pk)
        self.assertEqual(len(set(results)), 1)
        p.refresh_from_db()
        self.assertEqual(p.stock, 4)
        self.assertEqual(Movement.objects.filter(kind="sale").count(), 1)

    def test_simultaneous_cancellations_restock_once(self):
        p = product(5)
        o, _ = place_order(payload(p, quantity=3), "test")
        self.race(8, lambda i: transition(o.pk, "cancelled", "race-test").pk)
        p.refresh_from_db()
        self.assertEqual(p.stock, 5)
        self.assertEqual(Movement.objects.filter(kind="cancellation").count(), 1)
