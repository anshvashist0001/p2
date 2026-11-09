# Stockroom

Stockroom is an inventory and order management app built with Django, PostgreSQL, and React. It tracks stock changes, handles orders and cancellations, and helps identify when products need restocking.

The main problem it handles is keeping stock correct when several people order the same product at once. Each order runs in a database transaction, with product rows locked before stock is deducted. A movement ledger records each change so the stored quantity can be checked later.

## Run locally

You need Docker with Compose. From the project folder:

```sh
docker compose up --build -d
docker compose exec backend python manage.py seed_demo
```

Open [localhost:8080](http://localhost:8080). Sign in with username `demo` and password `warehouse-demo`.

The seed command adds eight products, five orders, and 90 days of generated sales history. It won't overwrite existing products or reset a password. To use a different password, copy `.env.example` to `.env` and change `DEMO_PASSWORD` before seeding.

For an empty workspace, skip the seed command and create an account:

```sh
docker compose exec backend python manage.py createsuperuser
```

Stop the app with `docker compose down`. The PostgreSQL volume keeps your data between runs.

## Features

- Add products with prices, reorder points, and supplier lead times.
- Receive deliveries or record a physical count, with a reason for each adjustment.
- Place multi-product orders. If any item lacks stock, the whole order rolls back.
- Ship confirmed orders or cancel them and restore their stock. Retrying a request won't duplicate an order or restock it twice.
- See low-stock alerts and a history of stock movements.
- Compare recorded quantities with the ledger and review differences. Counter repairs get their own audit records.

## Forecasts and anomaly detection

The Python backend runs two scikit-learn models locally. No external AI service or API key is needed.

**Demand forecasts** use a random forest trained on recent daily sales, weekday, and lagged demand. Each product needs at least 35 days of history and 14 days with sales. The app shows a two-week forecast and suggests a reorder quantity based on supplier lead time, a seven-day review period, and safety stock.

The last seven days are held out for evaluation. The model's mean absolute error is shown next to a moving-average baseline. The baseline sometimes wins; both results stay visible.

**Anomaly detection** uses an isolation forest to flag unusually large movements compared with the same product and movement type. Flags are suggestions to investigate, not confirmed errors. They never change stock automatically.

The sample history is synthetic. Forecasts only see recorded sales, so stockouts, cancellations, and missing data can affect the results. Models currently train on request; a larger deployment would need background training and caching.

## Project layout

```text
inventory/
  models.py          Products, orders, movements, and audit records
  services.py        Transactions and stock changes
  views.py           JSON endpoints and request validation
  intelligence.py    Forecasting and anomaly detection
  tests.py           Workflow, API, and concurrency tests
frontend/src/
  App.jsx            Workspace pages and application state
  api.js             Session-aware API requests
  components/        Tables, forms, and forecast charts
stockroom/           Django settings and URL routing
docs/analysis.sql    Queries for investigating stock discrepancies
```

Nginx serves React and forwards `/api` requests to Django. PostgreSQL stores data in a Docker volume. Staff accounts use session authentication and CSRF protection.

## Tests

```sh
docker compose exec backend python manage.py test inventory -v 2
docker compose exec backend python manage.py makemigrations --check --dry-run
python scripts/smoke.py
```

Run the smoke check after loading the demo data. It checks HTTP endpoints, login/logout, reconciliation, and model output without changing inventory.

The concurrency tests use separate PostgreSQL connections. They cover 20 purchases competing for five units, eight duplicate requests, and eight concurrent cancellations. These are correctness tests, not a traffic benchmark. See [test results](docs/verification.md) for the recorded runs and limitations.

## Development without Docker

Use Python 3.12+, Node 22.12+ or 24, and PostgreSQL. Install `requirements.txt` in a virtual environment. Set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` for your database; the defaults are `127.0.0.1:55432` and `stockroom` for the database, user, and password.

```sh
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 127.0.0.1:8000
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Vite forwards API requests to Django. If Docker dependency downloads are slow, there's an optional [offline wheel cache](wheels/README.md).

## Deployment notes

The included Compose setup is for local use and binds to `127.0.0.1`. A hosted deployment needs HTTPS, real secrets, `DEBUG=0`, allowed hosts, secure cookies, backups, login rate limiting, and a restricted database role. The app doesn't process payments or handle returns after shipment.
