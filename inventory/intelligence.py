"""Demand forecasts and stock movement checks built from the sales ledger."""

import math
from datetime import timedelta
import numpy as np
from django.db.models import Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from sklearn.ensemble import RandomForestRegressor, IsolationForest
from sklearn.metrics import mean_absolute_error
from .models import Product, Movement


def features(values, day, index):
    return [
        day.weekday(),
        index,
        float(np.mean(values[-7:])),
        float(np.mean(values[-14:])),
        values[-1],
        values[-7],
    ]


def forecast(product):
    today = timezone.localdate()
    start = today - timedelta(days=90)
    sales = Movement.objects.filter(
        product=product,
        kind="sale",
        created_at__date__gte=start,
        created_at__date__lt=today,
    )
    observed = {
        r["day"]: -r["total"]
        for r in sales.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Sum("delta"))
    }
    first = min(observed) if observed else today
    days = (today - first).days
    base = {
        "id": product.pk,
        "name": product.name,
        "sku": product.sku,
        "stock": product.stock,
        "history_days": days,
        "lead_time_days": product.lead_time_days,
    }
    if days < 35 or len(observed) < 14:
        return {
            **base,
            "ready": False,
            "reason": "Needs 35 calendar days and 14 days with sales.",
            "recommended_order": max(0, product.reorder_point - product.stock),
        }
    values = [observed.get(first + timedelta(days=i), 0) for i in range(days)]
    X = [features(values[:i], first + timedelta(days=i), i) for i in range(14, days)]
    y = values[14:]
    # Seven sequential one-day predictions; each uses only data known before that day.
    split = len(X) - 7
    model = RandomForestRegressor(
        n_estimators=80, min_samples_leaf=2, random_state=42, n_jobs=1
    )
    model.fit(X[:split], y[:split])
    held = model.predict(X[split:])
    mae = mean_absolute_error(y[split:], held)
    baseline = mean_absolute_error(y[split:], [row[2] for row in X[split:]])
    model.fit(X, y)
    # Future rolling features use predictions because actual sales aren't known yet.
    future = list(values)
    horizon = min(90, max(14, product.lead_time_days + 7))
    predicted = []
    for i in range(horizon):
        value = max(
            0.0,
            float(
                model.predict([features(future, today + timedelta(days=i), days + i)])[
                    0
                ]
            ),
        )
        predicted.append(value)
        future.append(value)
    daily = float(np.mean(predicted[:7]))
    safety = math.ceil(
        1.65 * float(np.std(values[-28:])) * math.sqrt(product.lead_time_days)
    )
    target = math.ceil(sum(predicted[: product.lead_time_days + 7])) + safety
    return {
        **base,
        "ready": True,
        "model": "Random forest",
        "mae": round(mae, 2),
        "baseline_mae": round(baseline, 2),
        "beats_baseline": bool(mae < baseline),
        "daily_demand": round(daily, 1),
        "days_cover": round(product.stock / daily, 1) if daily else None,
        "recommended_order": max(0, target - product.stock),
        "safety_stock": safety,
        "next_7_days": round(sum(predicted[:7])),
        "history": [
            {"date": str(first + timedelta(days=i)), "units": v}
            for i, v in enumerate(values[-14:], start=len(values) - 14)
        ],
        "forecast": [
            {"date": str(today + timedelta(days=i)), "units": round(v, 1)}
            for i, v in enumerate(predicted[:14])
        ],
    }


def anomalies():
    # Normalize each movement against same-product / same-kind magnitudes.
    rows = list(
        Movement.objects.select_related("product").order_by("-created_at")[:2000]
    )
    if len(rows) < 30:
        return {"ready": False, "reason": "Needs at least 30 movements.", "items": []}
    groups = {}
    for row in rows:
        groups.setdefault((row.product_id, row.kind), []).append(abs(row.delta))
    eligible = [
        r for r in rows if len(groups[(r.product_id, r.kind)]) >= 10 and r.delta != 0
    ]
    if len(eligible) < 30:
        return {
            "ready": False,
            "reason": "Needs 30 movements across groups with at least 10 comparable entries.",
            "items": [],
        }
    X = [
        [
            abs(r.delta) / max(1, np.median(groups[(r.product_id, r.kind)])),
            r.created_at.hour / 24,
        ]
        for r in eligible
    ]
    model = IsolationForest(
        n_estimators=100, contamination="auto", random_state=42, n_jobs=1
    ).fit(X)
    scores = model.decision_function(X)
    items = []
    for row, feature, score in zip(eligible, X, scores):
        if score < 0 and feature[0] >= 3:
            items.append(
                {
                    "id": row.pk,
                    "name": row.product.name,
                    "sku": row.product.sku,
                    "delta": row.delta,
                    "kind": row.kind,
                    "date": row.created_at.isoformat(),
                    "reason": f"{feature[0]:.1f}× the median size of comparable movements",
                    "score": round(float(score), 3),
                }
            )
    return {
        "ready": True,
        "model": "Isolation forest with a 3× magnitude review filter",
        "sample_size": len(eligible),
        "items": sorted(items, key=lambda x: x["score"])[:12],
    }


def analyze():
    return {
        "generated_at": timezone.now().isoformat(),
        "forecasts": [forecast(p) for p in Product.objects.order_by("name")],
        "anomalies": anomalies(),
        "limitations": "Forecasts use gross recorded sales, not unfulfilled demand. Stockouts and cancellations can bias estimates. MAE is a seven-day one-step backtest, not a guarantee of future accuracy. Suggestions never change stock automatically.",
    }
