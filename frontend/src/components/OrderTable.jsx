import React from "react";
import { money, date } from "../format";
import { Badge } from "./ui";

export default function OrderTable({ orders, compact, onAction }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            {!compact && (
              <>
                <th>Items</th>
                <th>Actions</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong className="order-id">
                  #{String(o.id).padStart(4, "0")}
                </strong>
                <small>{date(o.created_at)}</small>
              </td>
              <td>{o.customer}</td>
              <td>
                <Badge
                  type={
                    { confirmed: "blue", shipped: "green", cancelled: "gray" }[
                      o.status
                    ]
                  }
                >
                  {o.status}
                </Badge>
              </td>
              <td>{money(o.total)}</td>
              {!compact && (
                <>
                  <td>
                    <small>
                      {o.items
                        .map((i) => `${i.name} × ${i.quantity}`)
                        .join(", ")}
                    </small>
                  </td>
                  <td>
                    {o.status === "confirmed" && (
                      <div className="row-actions">
                        <button
                          className="text-btn"
                          onClick={() => onAction(o, "ship")}
                        >
                          Ship
                        </button>
                        <button
                          className="text-btn danger"
                          onClick={() => onAction(o, "cancel")}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
