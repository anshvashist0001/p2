-- Read-only investigations. Run in one repeatable-read transaction for a stable snapshot.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- A discrepancy means a counter differs from the signed movement ledger.
SELECT p.id, p.sku, p.name, p.stock AS recorded,
       COALESCE(SUM(m.delta), 0) AS ledger,
       p.stock - COALESCE(SUM(m.delta), 0) AS difference
FROM inventory_product p
LEFT JOIN inventory_movement m ON m.product_id = p.id
GROUP BY p.id
HAVING p.stock <> COALESCE(SUM(m.delta), 0)
ORDER BY ABS(p.stock - COALESCE(SUM(m.delta), 0)) DESC;

-- Low-stock products and their configured thresholds.
SELECT sku, name, stock, reorder_point, lead_time_days
FROM inventory_product WHERE stock <= reorder_point ORDER BY stock, sku;

-- Ledger roll-forward, by product and movement type.
SELECT p.sku, m.kind, COUNT(*) AS events, SUM(m.delta) AS net_units
FROM inventory_movement m JOIN inventory_product p ON p.id = m.product_id
GROUP BY p.sku, m.kind ORDER BY p.sku, m.kind;

-- Cancellation integrity: a cancelled order's movements should net to zero per product.
SELECT o.id, m.product_id, SUM(m.delta) AS remaining_deduction
FROM inventory_order o JOIN inventory_movement m ON m.order_id = o.id
WHERE o.status = 'cancelled'
GROUP BY o.id, m.product_id HAVING SUM(m.delta) <> 0;

-- Daily gross demand. Synthetic demo entries are included and explicitly labelled in notes.
SELECT product_id, (created_at AT TIME ZONE 'UTC')::date AS sale_date,
       -SUM(delta) AS units
FROM inventory_movement WHERE kind = 'sale'
GROUP BY product_id, sale_date ORDER BY sale_date DESC;

COMMIT;
