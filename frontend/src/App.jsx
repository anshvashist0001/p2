import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Sparkles,
  ScanLine,
  ArrowLeftRight,
  ArrowUpRight,
  Plus,
  ArrowRight,
  X,
  LogOut,
  RefreshCw,
  AlertTriangle,
  Check,
  Boxes,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

import { api } from "./api";
import { money, date, colorFor } from "./format";
import { Badge, SearchBox } from "./components/ui";
import ProductTable from "./components/ProductTable";
import OrderTable from "./components/OrderTable";
import Chart from "./components/ForecastChart";
import Modal from "./components/StockModal";

const nav = [
  ["Overview", LayoutDashboard],
  ["Inventory", Package],
  ["Orders", ShoppingBag],
  ["Intelligence", Sparkles],
  ["Reconciliation", ScanLine],
  ["Activity", ArrowLeftRight],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("Overview");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [intel, setIntel] = useState(null);
  const [movements, setMovements] = useState([]);
  const [recon, setRecon] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All products");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => {
    api("session")
      .then((s) => setUser(s.user))
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  async function refresh() {
    setLoading(true);
    try {
      const [p, o, d] = await Promise.all([
        api("products"),
        api("orders"),
        api("dashboard"),
      ]);
      setProducts(p.items);
      setOrders(o.items);
      setDashboard(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (user) refresh();
  }, [user]);
  useEffect(() => {
    setQuery("");
    setError("");
    if (!user) return;
    if (page === "Intelligence") loadIntel();
    if (page === "Reconciliation") loadRecon();
    if (page === "Activity")
      api("movements")
        .then((x) => setMovements(x.items))
        .catch((e) => setError(e.message));
  }, [page, user]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function loadIntel() {
    setLoading(true);
    try {
      setIntel(await api("intelligence"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function loadRecon() {
    try {
      setRecon(await api("reconciliation"));
    } catch (e) {
      setError(e.message);
    }
  }
  async function action(path, data, message) {
    setBusy(true);
    setError("");
    try {
      await api(path, data);
      setModal(null);
      setToast(message);
      setIntel(null);
      await refresh();
      if (page === "Reconciliation") await loadRecon();
      if (page === "Intelligence") await loadIntel();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(m) {
    setError("");
    setModal(m);
  }
  const shown = products.filter(
    (p) =>
      (p.name + " " + p.sku + " " + p.category)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "All products" ||
        (filter === "Low stock" ? p.low_stock : p.stock === 0)),
  );
  if (!ready) return <div className="loading-screen">Opening Stockroom…</div>;
  if (!user)
    return (
      <div className="login-page">
        <div className="login-brand">
          <Boxes size={30} /> stockroom<span>Inventory and orders.</span>
          <p>
            Keep track of stock and orders.
            <br />
            Plan your next restock.
          </p>
        </div>
        <form
          className="login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              const s = await api("login", Object.fromEntries(f));
              setUser(s.user);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">WORKSPACE ACCESS</span>
          <h1>Welcome back.</h1>
          <p>Sign in to your inventory workspace.</p>
          <label>
            Username
            <input
              name="username"
              required
              autoComplete="username"
              defaultValue="demo"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
          </button>
          <small>
            Local demo: demo / warehouse-demo
            <br />
            Run the seed command first. Custom demo passwords override this
            default.
          </small>
        </form>
      </div>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Overview");
          }}
        >
          <span className="brand-icon">
            <Boxes size={22} />
          </span>
          stockroom<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">S</span>
          <div>
            Studio workspace<small>Inventory management</small>
          </div>
          <span className="workspace-chev">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "nav-item active" : "nav-item"}
              onClick={() => setPage(label)}
            >
              <Icon size={18} />
              {label}
              {label === "Intelligence" && <span className="ai-pill">AI</span>}
              {label === "Orders" && dashboard?.active_orders > 0 && (
                <span className="nav-count">{dashboard.active_orders}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" /> Local workspace
            <small>Python · PostgreSQL · React</small>
          </div>
          <button
            className="profile"
            onClick={async () => {
              try {
                await api("logout", {});
                setUser(null);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <span className="avatar">{user[0].toUpperCase()}</span>
            <span>
              {user}
              <small>Workspace administrator</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </span>
          <div>
            <span className="demo-label">DEMO DATA</span>
            <span className="top-date">
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="avatar small">{user[0].toUpperCase()}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">WORKSPACE</div>
              <h1>{page === "Overview" ? "Inventory overview" : page}</h1>
              <p>
                {
                  {
                    Overview:
                      "Stock levels, recent orders, and products to restock.",
                    Inventory:
                      "Add products, receive deliveries, and record physical counts.",
                    Orders:
                      "Review orders, mark shipments, and handle cancellations.",
                    Intelligence:
                      "Review demand forecasts and unusual stock movements.",
                    Reconciliation:
                      "Check recorded stock against the movement ledger.",
                    Activity:
                      "A traceable history of every change to your stock.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="icon-btn"
                aria-label="Refresh data"
                disabled={loading}
                onClick={() => {
                  refresh();
                  if (page === "Intelligence") loadIntel();
                  if (page === "Reconciliation") loadRecon();
                  if (page === "Activity")
                    api("movements")
                      .then((x) => setMovements(x.items))
                      .catch((e) => setError(e.message));
                }}
              >
                <RefreshCw size={17} className={loading ? "spin" : ""} />
              </button>
              <button
                className="primary"
                onClick={() =>
                  open(
                    page === "Inventory"
                      ? { type: "product" }
                      : { type: "order", key: crypto.randomUUID() },
                  )
                }
              >
                <Plus size={17} />
                {page === "Inventory" ? "Add product" : "New order"}
              </button>
            </div>
          </div>
          {error && !modal && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="stats">
                {[
                  [
                    Package,
                    "Total products",
                    dashboard?.products,
                    "Across your catalog",
                    "mint",
                  ],
                  [
                    Boxes,
                    "Units in stock",
                    dashboard?.units?.toLocaleString(),
                    "Available to order",
                    "blue",
                  ],
                  [
                    ShoppingBag,
                    "Active orders",
                    dashboard?.active_orders,
                    "Awaiting fulfillment",
                    "purple",
                  ],
                  [
                    AlertTriangle,
                    "Low-stock products",
                    dashboard?.low_stock,
                    "At or below reorder point",
                    "amber",
                  ],
                ].map(([Icon, label, value, detail, color]) => (
                  <div className="stat" key={label}>
                    <div className="stat-top">
                      {label}
                      <span className={"stat-icon " + color}>
                        <Icon size={18} />
                      </span>
                    </div>
                    <strong>{value ?? "—"}</strong>
                    <span className="stat-detail">
                      {label === "Low-stock products" && (
                        <span className="tiny-dot" />
                      )}
                      {detail}
                    </span>
                  </div>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel inventory-overview">
                  <div className="panel-heading">
                    <div>
                      <h2>Inventory overview</h2>
                      <p>Current stock levels across your catalog</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => setPage("Inventory")}
                    >
                      View inventory <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <ProductTable
                    products={products.slice(0, 5)}
                    compact
                    onAdjust={(p) => open({ type: "adjust", product: p })}
                  />
                  <div className="panel-footer">
                    <span>
                      <span className="status-dot" /> Live database inventory
                    </span>
                    <span>
                      {money(dashboard?.value || 0)} total stock value
                    </span>
                  </div>
                </section>
                <section className="insight-card">
                  <div className="insight-tag">
                    <Sparkles size={16} /> STOCKROOM INTELLIGENCE
                  </div>
                  <div className="orb">
                    <TrendingUp size={45} />
                    <span className="orb-star">✧</span>
                  </div>
                  <h2>
                    Plan your next
                    <br />
                    restock.
                  </h2>
                  <p>
                    Forecast demand, spot unusual movements, and make informed
                    restocking decisions.
                  </p>
                  <div className="insight-detail">
                    <Check size={15} /> Runs locally. No API key needed.
                  </div>
                  <button onClick={() => setPage("Intelligence")}>
                    Explore intelligence <ArrowRight size={17} />
                  </button>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent orders</h2>
                      <p>The latest activity in your workspace</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => setPage("Orders")}
                    >
                      All orders <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <OrderTable orders={dashboard?.recent_orders || []} compact />
                </section>
                <section className="panel attention">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Needs attention{" "}
                        <span className="count-label">
                          {dashboard?.low_stock || 0}
                        </span>
                      </h2>
                      <p>Products that may need restocking</p>
                    </div>
                    <AlertTriangle size={19} />
                  </div>
                  {products
                    .filter((p) => p.low_stock)
                    .slice(0, 3)
                    .map((p) => (
                      <button
                        key={p.id}
                        className="attention-row"
                        onClick={() => open({ type: "adjust", product: p })}
                      >
                        <div className={"product-art " + colorFor(p)}>
                          <Package size={20} />
                        </div>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.stock === 0
                              ? "Out of stock"
                              : `${p.stock} left · reorder at ${p.reorder_point}`}
                          </small>
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                    ))}
                  {products.every((p) => !p.low_stock) && (
                    <div className="empty">
                      All products are above their reorder points.
                    </div>
                  )}
                  <div className="attention-footer">
                    Stock alerts update after every transaction.
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "Inventory" && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="tabs">
                  {["All products", "Low stock", "Out of stock"].map((t) => (
                    <button
                      key={t}
                      className={filter === t ? "selected" : ""}
                      onClick={() => setFilter(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <SearchBox value={query} onChange={setQuery} />
              </div>
              <ProductTable
                products={shown}
                onAdjust={(p) => open({ type: "adjust", product: p })}
              />
              {!shown.length && (
                <div className="empty">
                  No products found. Add a product to get started.
                </div>
              )}
              <div className="panel-footer">
                {shown.length} products{" "}
                <span>Stock changes are recorded in the movement ledger.</span>
              </div>
            </section>
          )}
          {page === "Orders" && (
            <section className="panel">
              <div className="table-toolbar">
                <h2>
                  Orders <span className="count-label">{orders.length}</span>
                </h2>
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  placeholder="Search customer or order…"
                />
              </div>
              <OrderTable
                orders={orders.filter((o) =>
                  (o.customer + " " + o.id + " " + o.status)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )}
                onAction={(o, target) =>
                  open({ type: "transition", order: o, target })
                }
              />
              {orders.length === 0 && (
                <div className="empty">
                  No orders yet. Create your first order above.
                </div>
              )}
              <div className="panel-footer">
                Showing up to 200 latest orders{" "}
                <span>Confirmed → Shipped or Cancelled</span>
              </div>
            </section>
          )}
          {page === "Intelligence" && (
            <>
              <div className="intel-banner">
                <Sparkles size={23} />
                <div>
                  <h2>Demand forecasts and stock anomalies</h2>
                  <p>
                    Random forest demand forecasting + isolation forest anomaly
                    detection. All models run in Python.
                  </p>
                </div>
                <Badge type="green">LOCAL ML</Badge>
              </div>
              {loading && (
                <div className="empty">
                  Training on your stock history and evaluating predictions…
                </div>
              )}
              {!loading && intel && (
                <>
                  <div className="section-title">
                    <h2>Demand & replenishment</h2>
                    <span>7-day forecast · 7-day holdout evaluation</span>
                  </div>
                  <div className="forecast-grid">
                    {intel.forecasts.map((f) => (
                      <section className="panel forecast-card" key={f.id}>
                        <div className="forecast-title">
                          <span className="product-art mint">
                            <Package size={20} />
                          </span>
                          <div>
                            <h3>{f.name}</h3>
                            <small>
                              {f.sku} · {f.history_days} days of sales history
                            </small>
                          </div>
                        </div>
                        {f.ready ? (
                          <>
                            <div className="forecast-numbers">
                              <div>
                                <small>Next 7 days</small>
                                <strong>
                                  {f.next_7_days}
                                  <em> units</em>
                                </strong>
                              </div>
                              <div>
                                <small>Stock coverage</small>
                                <strong>
                                  {f.days_cover ?? "—"}
                                  <em> days</em>
                                </strong>
                              </div>
                            </div>
                            <Chart forecast={f} />
                            <div className="chart-key">
                              <span>— Recorded sales</span>
                              <span>┄ Forecast</span>
                            </div>
                            <div className="recommendation">
                              <span>
                                Suggested replenishment
                                <strong>{f.recommended_order} units</strong>
                              </span>
                              <button
                                className="icon-btn"
                                aria-label={"Receive stock for " + f.name}
                                onClick={() =>
                                  open({
                                    type: "adjust",
                                    product: products.find(
                                      (p) => p.id === f.id,
                                    ),
                                  })
                                }
                              >
                                <ArrowUpRight size={18} />
                              </button>
                            </div>
                            <div className="model-note">
                              Model MAE: <b>{f.mae}</b> · Baseline MAE:{" "}
                              <b>{f.baseline_mae}</b>
                              <br />
                              {f.beats_baseline
                                ? "Model performed better on this holdout."
                                : "Baseline performed as well or better; use caution."}
                              <br />
                              Target = lead-time demand + 7 days +{" "}
                              {f.safety_stock} safety units.
                            </div>
                          </>
                        ) : (
                          <div className="empty">
                            {f.reason}
                            <p>
                              Threshold-based replenishment:{" "}
                              {f.recommended_order} units
                            </p>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                  <section className="panel anomaly-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Movement anomalies</h2>
                        <p>
                          Unusual entries for human review; these are not
                          confirmed errors.
                        </p>
                      </div>
                      <Badge type="amber">
                        {intel.anomalies.items.length} flagged
                      </Badge>
                    </div>
                    {intel.anomalies.items.map((a) => (
                      <div className="anomaly-row" key={a.id}>
                        <AlertTriangle size={20} />
                        <div>
                          <strong>{a.name}</strong>
                          <p>
                            {a.reason} · {a.kind} · {date(a.date)}
                          </p>
                        </div>
                        <b>{a.delta} units</b>
                      </div>
                    ))}
                    {!intel.anomalies.items.length && (
                      <div className="empty">
                        {intel.anomalies.reason ||
                          "No unusual movements met the review threshold."}
                      </div>
                    )}
                  </section>
                  <p className="disclaimer">
                    {intel.limitations} Seeded records are synthetic
                    demonstration data.
                  </p>
                </>
              )}
            </>
          )}
          {page === "Reconciliation" && recon && (
            <>
              <div className="recon-summary">
                <ScanLine size={26} />
                <div>
                  <h2>
                    {recon.items.filter((r) => r.difference !== 0).length}{" "}
                    discrepancies found
                  </h2>
                  <p>
                    Recorded stock compared with the sum of all signed stock
                    movements.
                  </p>
                </div>
                <button className="secondary" onClick={loadRecon}>
                  <RefreshCw size={15} /> Run again
                </button>
              </div>
              <section className="panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Recorded</th>
                        <th>Ledger balance</th>
                        <th>Difference</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {recon.items.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.name}</strong>
                            <small>{r.sku}</small>
                          </td>
                          <td>{r.recorded}</td>
                          <td>{r.ledger}</td>
                          <td>
                            {r.difference > 0 ? "+" : ""}
                            {r.difference}
                          </td>
                          <td>
                            <Badge type={r.difference ? "amber" : "green"}>
                              {r.difference ? "Review needed" : "Matched"}
                            </Badge>
                          </td>
                          <td>
                            {r.difference !== 0 && (
                              <button
                                className="text-btn"
                                onClick={() => open({ type: "repair", row: r })}
                              >
                                Review repair <ArrowRight size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel-footer">
                  Repairs restore the recorded counter to the ledger balance.{" "}
                  <span>Use physical counts for real stock changes.</span>
                </div>
              </section>
              {recon.repairs.length > 0 && (
                <section className="panel repair-history">
                  <div className="panel-heading">
                    <h2>Repair audit trail</h2>
                  </div>
                  {recon.repairs.map((r) => (
                    <div className="anomaly-row" key={r.id}>
                      <Check size={18} />
                      <span>
                        {r.product__name}: {r.before} → {r.after} units ·{" "}
                        {r.actor} · {date(r.created_at)}
                      </span>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {page === "Activity" && (
            <section className="panel">
              <div className="table-toolbar">
                <h2>Stock movement ledger</h2>
                <SearchBox value={query} onChange={setQuery} />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Movement</th>
                      <th>Units</th>
                      <th>Reason</th>
                      <th>By</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements
                      .filter((m) =>
                        (m.name + " " + m.sku + " " + m.kind)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((m) => (
                        <tr key={m.id}>
                          <td>
                            <strong>{m.name}</strong>
                            <small>{m.sku}</small>
                          </td>
                          <td>
                            <Badge>{m.kind}</Badge>
                          </td>
                          <td
                            className={m.delta >= 0 ? "positive" : "negative"}
                          >
                            {m.delta > 0 ? "+" : ""}
                            {m.delta}
                          </td>
                          <td className="note-cell">{m.note}</td>
                          <td>{m.actor}</td>
                          <td>{date(m.created_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-footer">
                Showing the latest 250 movements
              </div>
            </section>
          )}
          <footer className="app-footer">
            <span>
              stockroom <span className="muted">/</span> Inventory and orders
            </span>
            <span>
              <span className="status-dot" /> Connected to PostgreSQL
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          modal={modal}
          products={products}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setModal(null);
              setError("");
            }
          }}
          action={action}
        />
      )}
    </div>
  );
}
