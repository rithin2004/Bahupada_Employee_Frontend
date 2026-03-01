ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS invoice_number text;

-- Backfill from initial invoices for existing orders where possible.
WITH first_initial AS (
    SELECT DISTINCT ON (sales_order_id)
        sales_order_id,
        invoice_number
    FROM sales_initial_invoices
    WHERE invoice_number IS NOT NULL
    ORDER BY sales_order_id, created_at ASC
)
UPDATE sales_orders so
SET invoice_number = fi.invoice_number
FROM first_initial fi
WHERE so.id = fi.sales_order_id
  AND so.invoice_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_invoice_number
    ON sales_orders (invoice_number)
    WHERE invoice_number IS NOT NULL;
