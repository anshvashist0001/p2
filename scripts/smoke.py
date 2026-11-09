"""Read-only HTTP smoke checks against the actual Nginx -> Django -> PostgreSQL app."""

import http.cookiejar
import json
import os
import urllib.request

base = os.environ.get("APP_URL", "http://127.0.0.1:8080")
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)
csrf = ""


def request(path, data=None):
    global csrf
    req = urllib.request.Request(
        base + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json", "X-CSRFToken": csrf},
    )
    with opener.open(req, timeout=180) as response:
        body = json.load(response)
    csrf = body.get("csrf", csrf)
    return body


with opener.open(base, timeout=30) as response:
    assert response.status == 200
    assert b'<div id="root"></div>' in response.read()
request("/api/session")
request(
    "/api/login",
    {
        "username": os.environ.get("DEMO_USERNAME", "demo"),
        "password": os.environ.get("DEMO_PASSWORD", "warehouse-demo"),
    },
)
for path in ["products", "orders", "dashboard", "movements", "reconciliation"]:
    result = request("/api/" + path)
    if path == "reconciliation":
        assert all(r["difference"] == 0 for r in result["items"]), result
    print(f"PASS /api/{path}")
result = request("/api/intelligence")
assert result["forecasts"], "Seed the demonstration data first."
assert all(f["ready"] for f in result["forecasts"])
print("PASS /api/intelligence: model training, forecast, backtest and anomaly scoring")
print(
    json.dumps(
        {
            "forecasts": len(result["forecasts"]),
            "anomaly_flags": len(result["anomalies"]["items"]),
            "evaluation": [
                {"sku": f["sku"], "mae": f["mae"], "baseline_mae": f["baseline_mae"]}
                for f in result["forecasts"]
            ],
        },
        indent=2,
    )
)
request("/api/logout", {})
assert request("/api/session")["user"] is None
print("PASS logout and session invalidation")
