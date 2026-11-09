import React from "react";
import { useEffect, useState, useRef } from "react";
import { X, Plus, ArrowRight } from "lucide-react";
import { money } from "../format";

export default function StockModal({
  modal,
  products,
  busy,
  error,
  onClose,
  action,
}) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const first = dialogRef.current?.querySelector("input,select,button");
    first?.focus();
    return () => previous?.focus();
  }, []);
  function trapFocus(e) {
    if (e.key === "Escape") onClose();
    if (e.key !== "Tab") return;
    const items = [
      ...dialogRef.current.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
      ),
    ];
    const first = items[0],
      last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  const [lines, setLines] = useState([
    { product_id: products[0]?.id || "", quantity: 1 },
  ]);
  const title = {
    product: "Add a product",
    order: "Create an order",
    adjust: "Adjust stock",
    transition: modal.target === "ship" ? "Ship order" : "Cancel order",
    repair: "Repair recorded inventory",
  }[modal.type];
  async function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (modal.type === "product") {
      ["stock", "reorder_point", "lead_time_days"].forEach(
        (k) => (d[k] = Number(d[k])),
      );
      await action("products", d, "Product added to inventory.");
    }
    if (modal.type === "order")
      await action(
        "orders",
        {
          customer: d.customer,
          key: modal.key,
          items: lines.map((l) => ({
            product_id: Number(l.product_id),
            quantity: Number(l.quantity),
          })),
        },
        "Order placed. Stock has been updated.",
      );
    if (modal.type === "adjust")
      await action(
        `products/${modal.product.id}/adjust`,
        {
          ...d,
          quantity: Number(d.quantity),
          expected_stock: modal.product.stock,
        },
        "Stock adjustment recorded.",
      );
    if (modal.type === "transition")
      await action(
        `orders/${modal.order.id}/${modal.target}`,
        {},
        modal.target === "ship"
          ? "Order marked as shipped."
          : "Order cancelled and stock restored.",
      );
    if (modal.type === "repair")
      await action(
        `reconciliation/${modal.row.id}/repair`,
        modal.row,
        "Stock counter repaired. Audit entry saved.",
      );
  }
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onKeyDown={trapFocus}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">STOCKROOM WORKSPACE</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={19} />
          </button>
        </div>
        <form onSubmit={submit}>
          {modal.type === "product" && (
            <>
              <div className="form-grid">
                <label>
                  Product name
                  <input
                    name="name"
                    required
                    maxLength={120}
                    autoFocus
                    placeholder="e.g. Studio desk lamp"
                  />
                </label>
                <label>
                  SKU
                  <input
                    name="sku"
                    required
                    maxLength={40}
                    placeholder="DSK-009"
                  />
                </label>
                <label>
                  Category
                  <input
                    name="category"
                    required
                    defaultValue="General"
                    maxLength={60}
                  />
                </label>
                <label>
                  Unit price (₹)
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                    required
                  />
                </label>
                <label>
                  Opening stock
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    max="1000000"
                    defaultValue="0"
                    required
                  />
                </label>
                <label>
                  Reorder point
                  <input
                    name="reorder_point"
                    type="number"
                    min="0"
                    defaultValue="20"
                    required
                  />
                </label>
                <label>
                  Supplier lead time (days)
                  <input
                    name="lead_time_days"
                    type="number"
                    min="1"
                    max="60"
                    defaultValue="7"
                    required
                  />
                </label>
              </div>
            </>
          )}
          {modal.type === "order" && (
            <>
              <label>
                Customer name
                <input
                  name="customer"
                  required
                  maxLength={120}
                  autoFocus
                  placeholder="Enter customer name"
                />
              </label>
              <div className="line-label">ORDER ITEMS</div>
              {lines.map((l, i) => (
                <div className="order-line" key={i}>
                  <label>
                    Product
                    <select
                      aria-label={"Product " + (i + 1)}
                      value={l.product_id}
                      onChange={(e) =>
                        setLines(
                          lines.map((x, j) =>
                            j === i ? { ...x, product_id: e.target.value } : x,
                          ),
                        )
                      }
                      required
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name} ({p.stock} available)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      aria-label={"Quantity " + (i + 1)}
                      type="number"
                      min="1"
                      max="1000000"
                      value={l.quantity}
                      required
                      onChange={(e) =>
                        setLines(
                          lines.map((x, j) =>
                            j === i ? { ...x, quantity: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  {lines.length > 1 && (
                    <button
                      className="icon-btn remove-line"
                      type="button"
                      aria-label="Remove item"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button
                className="text-btn"
                type="button"
                onClick={() =>
                  setLines([
                    ...lines,
                    { product_id: products[0]?.id || "", quantity: 1 },
                  ])
                }
              >
                <Plus size={15} /> Add item
              </button>
              <div className="order-total">
                Order total
                <strong>
                  {money(
                    lines.reduce(
                      (s, l) =>
                        s +
                        Number(
                          products.find((p) => p.id === Number(l.product_id))
                            ?.price || 0,
                        ) *
                          Number(l.quantity),
                      0,
                    ),
                  )}
                </strong>
              </div>
              <p className="form-note">
                Stock is checked and deducted in one database transaction.
              </p>
            </>
          )}
          {modal.type === "adjust" && (
            <>
              <div className="form-summary">
                <strong>{modal.product.name}</strong>
                <span>{modal.product.stock} units currently in stock</span>
              </div>
              <label>
                Adjustment type
                <select name="kind">
                  <option value="receipt">Receive stock (add units)</option>
                  <option value="count">
                    Physical count (set actual units)
                  </option>
                </select>
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  max="1000000"
                  required
                  autoFocus
                />
              </label>
              <label>
                Reason
                <input
                  name="note"
                  maxLength={240}
                  required
                  placeholder="e.g. Supplier delivery INV-102"
                />
              </label>
              <p className="form-note">
                A movement with your username and reason will be added to the
                ledger.
              </p>
            </>
          )}
          {modal.type === "transition" && (
            <p className="confirm-copy">
              {modal.target === "ship"
                ? `Mark order #${modal.order.id} for ${modal.order.customer} as shipped? Shipped orders cannot be cancelled.`
                : `Cancel order #${modal.order.id} for ${modal.order.customer}? All units will be returned to available stock exactly once.`}
            </p>
          )}
          {modal.type === "repair" && (
            <p className="confirm-copy">
              Restore <strong>{modal.row.name}</strong> from{" "}
              {modal.row.recorded} recorded units to its ledger balance of{" "}
              <strong>{modal.row.ledger} units</strong>? This repairs the
              counter and records an audit entry. It does not change the
              movement ledger.
            </p>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="secondary"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Close
            </button>
            <button
              className="primary"
              disabled={busy || (modal.type === "order" && !products.length)}
            >
              {busy
                ? "Saving…"
                : modal.type === "order"
                  ? "Place order"
                  : modal.type === "transition"
                    ? "Confirm"
                    : modal.type === "repair"
                      ? "Repair counter"
                      : "Save changes"}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
