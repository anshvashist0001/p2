import json
from decimal import Decimal, InvalidOperation
from functools import wraps
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.http import JsonResponse
from django.middleware.csrf import get_token
from .models import Product, Order, Movement, ReconciliationAudit
from . import services


def endpoint(methods, public=False):
    def decorate(fn):
        @wraps(fn)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                return JsonResponse({"error": "Method not allowed."}, status=405)
            if not public and (
                not request.user.is_authenticated or not request.user.is_staff
            ):
                return JsonResponse(
                    {"error": "Sign in with a staff account."}, status=401
                )
            try:
                request.payload = json.loads(request.body or "{}")
                if not isinstance(request.payload, dict):
                    raise ValueError("Expected a JSON object.")
                return fn(request, *args, **kwargs)
            except services.Conflict as exc:
                return JsonResponse({"error": str(exc)}, status=409)
            except (ValueError, TypeError, InvalidOperation) as exc:
                return JsonResponse({"error": str(exc)}, status=400)
            except ObjectDoesNotExist:
                return JsonResponse({"error": "Record not found."}, status=404)
            except IntegrityError:
                return JsonResponse(
                    {
                        "error": "This record conflicts with an existing record or a database constraint."
                    },
                    status=409,
                )

        return wrapped

    return decorate


def product_json(p):
    return {
        "id": p.pk,
        "sku": p.sku,
        "name": p.name,
        "category": p.category,
        "price": str(p.price),
        "stock": p.stock,
        "reorder_point": p.reorder_point,
        "lead_time_days": p.lead_time_days,
        "low_stock": p.stock <= p.reorder_point,
    }


def order_json(o):
    items = list(o.items.select_related("product"))
    return {
        "id": o.pk,
        "customer": o.customer,
        "status": o.status,
        "created_at": o.created_at.isoformat(),
        "total": str(sum((i.unit_price * i.quantity for i in items), Decimal(0))),
        "items": [
            {
                "product_id": i.product_id,
                "name": i.product.name,
                "quantity": i.quantity,
                "unit_price": str(i.unit_price),
            }
            for i in items
        ],
    }


@endpoint(["GET"], public=True)
def session(request):
    return JsonResponse(
        {
            "user": (
                request.user.username
                if request.user.is_authenticated and request.user.is_staff
                else None
            ),
            "csrf": get_token(request),
        }
    )


@endpoint(["POST"], public=True)
def login(request):
    user = authenticate(
        request,
        username=request.payload.get("username"),
        password=request.payload.get("password"),
    )
    if user is None or not user.is_staff:
        return JsonResponse({"error": "Invalid staff credentials."}, status=401)
    auth_login(request, user)
    return JsonResponse({"user": user.username, "csrf": get_token(request)})


@endpoint(["POST"])
def logout(request):
    auth_logout(request)
    return JsonResponse({"ok": True, "csrf": get_token(request)})


@endpoint(["GET"])
def dashboard(request):
    products = Product.objects.all()
    return JsonResponse(
        {
            "products": products.count(),
            "units": products.aggregate(n=Sum("stock"))["n"] or 0,
            "value": str(sum((p.price * p.stock for p in products), Decimal(0))),
            "low_stock": products.filter(stock__lte=F("reorder_point")).count(),
            "active_orders": Order.objects.filter(status="confirmed").count(),
            "recent_orders": [
                order_json(o) for o in Order.objects.order_by("-created_at")[:5]
            ],
        }
    )


@endpoint(["GET", "POST"])
def products(request):
    if request.method == "GET":
        return JsonResponse(
            {"items": [product_json(p) for p in Product.objects.order_by("name")]}
        )
    d = request.payload
    price = Decimal(str(d.get("price", "0")))
    if (
        not price.is_finite()
        or price < 0
        or price > Decimal("99999999.99")
        or price.as_tuple().exponent < -2
    ):
        raise ValueError("Price must be nonnegative with at most two decimal places.")
    with transaction.atomic():
        p = Product.objects.create(
            sku=services.label(d.get("sku"), "SKU", 40).upper(),
            name=services.label(d.get("name"), "Name"),
            category=services.label(d.get("category", "General"), "Category", 60),
            price=price,
            reorder_point=services.integer(d.get("reorder_point", 20), "Reorder point"),
            lead_time_days=services.integer(
                d.get("lead_time_days", 7), "Lead time", 1, 60
            ),
        )
        services.move(
            p,
            services.integer(d.get("stock", 0), "Opening stock"),
            "opening",
            "Opening balance",
            request.user.username,
        )
    return JsonResponse(product_json(p), status=201)


@endpoint(["POST"])
def adjust(request, pk):
    return JsonResponse(
        product_json(services.adjust_stock(pk, request.payload, request.user.username))
    )


@endpoint(["GET", "POST"])
def orders(request):
    if request.method == "GET":
        return JsonResponse(
            {
                "items": [
                    order_json(o) for o in Order.objects.order_by("-created_at")[:200]
                ]
            }
        )
    o, created = services.place_order(request.payload, request.user.username)
    return JsonResponse(order_json(o), status=201 if created else 200)


@endpoint(["POST"])
def cancel(request, pk):
    return JsonResponse(
        order_json(services.transition(pk, "cancelled", request.user.username))
    )


@endpoint(["POST"])
def ship(request, pk):
    return JsonResponse(
        order_json(services.transition(pk, "shipped", request.user.username))
    )


@endpoint(["GET"])
def movements(request):
    return JsonResponse(
        {
            "items": [
                {
                    "id": m.pk,
                    "name": m.product.name,
                    "sku": m.product.sku,
                    "delta": m.delta,
                    "kind": m.kind,
                    "note": m.note,
                    "actor": m.actor,
                    "created_at": m.created_at.isoformat(),
                }
                for m in Movement.objects.select_related("product").order_by(
                    "-created_at"
                )[:250]
            ]
        }
    )


@endpoint(["GET"])
def reconciliation(request):
    return JsonResponse(
        {
            "items": services.reconcile(),
            "repairs": list(
                ReconciliationAudit.objects.order_by("-created_at").values(
                    "id", "product__name", "before", "after", "actor", "created_at"
                )[:20]
            ),
        }
    )


@endpoint(["POST"])
def repair(request, pk):
    services.reconcile(
        pk,
        request.user.username,
        services.integer(request.payload.get("recorded"), "Recorded stock"),
        services.integer(request.payload.get("ledger"), "Ledger stock"),
    )
    return JsonResponse({"ok": True})


@endpoint(["GET"])
def intelligence(request):
    from .intelligence import analyze

    return JsonResponse(analyze())
