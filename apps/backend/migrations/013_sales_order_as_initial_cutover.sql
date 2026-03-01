-- Phase-2 cutover: treat sales_orders as initial invoices.

ALTER TABLE packing_tasks
    ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id);

UPDATE packing_tasks pt
SET sales_order_id = si.sales_order_id
FROM sales_initial_invoices si
WHERE pt.sales_order_id IS NULL
  AND pt.sales_initial_invoice_id = si.id;

ALTER TABLE packing_tasks
    ALTER COLUMN sales_order_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_packing_tasks_sales_order_id
    ON packing_tasks(sales_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_tasks_sales_order
    ON packing_tasks(sales_order_id);

ALTER TABLE sales_final_invoices
    ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id);

UPDATE sales_final_invoices sf
SET sales_order_id = si.sales_order_id
FROM sales_initial_invoices si
WHERE sf.sales_order_id IS NULL
  AND sf.sales_initial_invoice_id = si.id;

ALTER TABLE sales_final_invoices
    ALTER COLUMN sales_order_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_final_invoices_sales_order_id
    ON sales_final_invoices(sales_order_id);

CREATE TABLE IF NOT EXISTS sales_order_reservations (
    id uuid PRIMARY KEY,
    sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text,
    reserved_quantity numeric(18,4),
    picked_quantity numeric(18,4),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sales_order_reservations (
    id,
    sales_order_id,
    product_id,
    batch_number,
    reserved_quantity,
    picked_quantity,
    created_at,
    updated_at
)
SELECT
    sii.id,
    si.sales_order_id,
    sii.product_id,
    sii.batch_number,
    sii.reserved_quantity,
    sii.picked_quantity,
    now(),
    now()
FROM sales_initial_invoice_items sii
JOIN sales_initial_invoices si ON si.id = sii.sales_initial_invoice_id
LEFT JOIN sales_order_reservations sor ON sor.id = sii.id
WHERE sor.id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_order_resv_order_product
    ON sales_order_reservations(sales_order_id, product_id);

CREATE INDEX IF NOT EXISTS idx_sales_order_resv_batch
    ON sales_order_reservations(sales_order_id, batch_number);

-- Orders with initial invoice history are considered created in new flow.
UPDATE sales_orders
SET status = 'CREATED'
WHERE id IN (SELECT sales_order_id FROM sales_initial_invoices)
  AND upper(status) = 'PENDING';

ALTER TABLE packing_tasks
    DROP COLUMN IF EXISTS sales_initial_invoice_id;

ALTER TABLE sales_final_invoices
    DROP COLUMN IF EXISTS sales_initial_invoice_id;

DROP TABLE IF EXISTS sales_initial_invoice_items;
DROP TABLE IF EXISTS sales_initial_invoices;
