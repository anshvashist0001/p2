# Test results

## 9 November 2026

After the source cleanup and component split:

- Both Docker images built successfully; the app started with healthy database and backend containers.
- All 20 tests passed in 5.727 seconds, including the concurrent order and cancellation cases.
- The migration check reported no schema changes.
- The HTTP smoke checks passed for login, products, orders, dashboard, movements, reconciliation, forecasts, and logout.
- The existing demo data still balanced against the ledger. All eight products returned forecasts, and one movement was flagged for review.

The source changes reorganize the code and simplify the wording. Order processing and stock calculations are unchanged. Browser visual checks have not been completed.

## 8 November 2026

The results below are from the original implementation run. Timings describe development tests, not production throughput.

### Docker checks

- Python/Django and React/Nginx images built successfully. The Python image used the documented local Linux wheel cache after slow registry/PyPI downloads.
- PostgreSQL and backend health checks passed; Nginx serves the app at `http://localhost:8080`.
- `docker compose exec -T backend python manage.py test inventory -v 2 --noinput`: **20 tests passed in 9.846 seconds**. This includes the additional JSON API order/cancellation/receipt workflow test. Test duration is not an HTTP latency or throughput result.
- `makemigrations --check --dry-run`: no changes detected.
- `python scripts/smoke.py`: passed HTML delivery, session/CSRF login, products, orders, dashboard, movements, reconciliation, ML output, logout, and session invalidation.
- `docs/analysis.sql` ran successfully in a read-only transaction. No inventory-counter discrepancies or cancellation-ledger discrepancies were found in the seeded demo.
- Eight forecast results and one anomaly flag were returned for synthetic demo data. All three containers were running at the end of the check.

Synthetic demonstration forecast evaluation (7-day one-step holdout; MAE in units):

| SKU | Random forest MAE | Moving-average MAE |
|---|---:|---:|
| PLN-008 | 0.93 | 0.73 |
| NTB-006 | 1.40 | 1.80 |
| BAG-003 | 1.96 | 1.90 |
| BOT-004 | 9.53 | 7.27 |
| KEY-005 | 1.16 | 1.10 |
| DSK-001 | 0.97 | 0.90 |
| CHG-007 | 0.98 | 1.51 |
| AUD-002 | 1.17 | 1.37 |

The random forest outperformed this baseline for three of eight demo products. No general accuracy improvement is claimed. The UI exposes both errors, including when the baseline wins. These values change with the evaluation date and added data.

### PostgreSQL checks

Command: `.venv\Scripts\python manage.py test inventory -v 2 --noinput`

Environment: Python 3.12.8, Django 5.2.9, PostgreSQL 18.4, scikit-learn 1.9.0.

Result: **19 tests passed**, reported test duration **14.407 seconds**. Database setup, imports and process startup are outside that reported test duration. Tests ran in a separate disposable `test_stockroom` database.

Measured purchase scenario:

| Measure | Observed result |
|---|---:|
| Simultaneous service calls using a thread barrier | 20 |
| Starting inventory | 5 units |
| Confirmed orders | 5 |
| Insufficient-stock rejections | 15 |
| Ending product stock | 0 |
| Ending movement-ledger balance | 0 |

Eight simultaneous requests with the same idempotency key created one order and deducted stock once. Eight simultaneous cancellations restored stock once. These are in-process service-level concurrency tests with separate PostgreSQL connections; they are **not** HTTP load tests or throughput benchmarks.

Other passing cases: multi-line rollback, duplicate line aggregation, quantity validation, rejected shipped-order cancellation, stale count and repair rejection, reconciliation audit records, staff-only access, login CSRF enforcement, product validation, ML cold start, forecasting with current-day exclusion, and a synthetic anomalous movement.

### Frontend

React production build passed locally and in the Node/Nginx Docker image. The final container build compiled 1,573 modules, producing a 257.32 kB JavaScript bundle (79.25 kB gzip). These sizes describe this build only.

Browser checks were blocked by the automation tool’s URL verification. The build and HTTP checks passed, but the visual layout and browser interactions were not verified.
