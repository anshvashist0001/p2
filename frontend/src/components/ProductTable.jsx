import React from "react";
import { Package, ArrowUpRight } from "lucide-react";
import { money, colorFor } from "../format";
import { Badge } from "./ui";

export default function ProductTable({ products, compact, onAdjust }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            {!compact && <th>Category</th>}
            <th>Stock</th>
            <th>Status</th>
            <th>Price</th>
            {!compact && <th />}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="product-cell">
                  <span className={"product-art " + colorFor(p)}>
                    <Package size={21} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </span>
                </div>
              </td>
              {!compact && <td>{p.category}</td>}
              <td>
                <strong>{p.stock}</strong>
                <span className="units"> units</span>
              </td>
              <td>
                <Badge
                  type={p.stock === 0 ? "red" : p.low_stock ? "amber" : "green"}
                >
                  <span className="badge-dot" />
                  {p.stock === 0
                    ? "Out of stock"
                    : p.low_stock
                      ? "Low stock"
                      : "In stock"}
                </Badge>
              </td>
              <td>{money(p.price)}</td>
              {!compact && (
                <td>
                  <button className="text-btn" onClick={() => onAdjust(p)}>
                    Adjust <ArrowUpRight size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
