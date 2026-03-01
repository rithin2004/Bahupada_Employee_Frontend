-- Recovery-safe migration for environments where 013 was partially applied.
-- This file is idempotent and guards references to dropped legacy tables.

DO $$
BEGIN
    IF to_regclass('public.packing_tasks') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE packing_tasks ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id)';
        IF to_regclass('public.sales_initial_invoices') IS NOT NULL THEN
            EXECUTE '
                UPDATE packing_tasks pt
                SET sales_order_id = si.sales_order_id
                FROM sales_initial_invoices si
                WHERE pt.sales_order_id IS NULL
                  AND pt.sales_initial_invoice_id = si.id
            ';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.sales_final_invoices') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE sales_final_invoices ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id)';
        IF to_regclass('public.sales_initial_invoices') IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'sales_final_invoices'
                 AND column_name = 'sales_initial_invoice_id'
           ) THEN
            EXECUTE '
                UPDATE sales_final_invoices sf
                SET sales_order_id = si.sales_order_id
                FROM sales_initial_invoices si
                WHERE sf.sales_order_id IS NULL
                  AND sf.sales_initial_invoice_id = si.id
            ';
        END IF;
    END IF;
END $$;

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

DO $$
BEGIN
    IF to_regclass('public.sales_initial_invoice_items') IS NOT NULL
       AND to_regclass('public.sales_initial_invoices') IS NOT NULL THEN
        EXECUTE '
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
            WHERE sor.id IS NULL
        ';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_order_resv_order_product
    ON sales_order_reservations(sales_order_id, product_id);

CREATE INDEX IF NOT EXISTS idx_sales_order_resv_batch
    ON sales_order_reservations(sales_order_id, batch_number);

CREATE INDEX IF NOT EXISTS idx_packing_tasks_sales_order_id
    ON packing_tasks(sales_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_tasks_sales_order
    ON packing_tasks(sales_order_id);

CREATE INDEX IF NOT EXISTS idx_sales_final_invoices_sales_order_id
    ON sales_final_invoices(sales_order_id);

-- Transition legacy pending orders to created where legacy initial invoice exists.
DO $$
BEGIN
    IF to_regclass('public.sales_initial_invoices') IS NOT NULL THEN
        EXECUTE '
            UPDATE sales_orders
            SET status = ''CREATED''
            WHERE id IN (SELECT sales_order_id FROM sales_initial_invoices)
              AND upper(status) = ''PENDING''
        ';
    END IF;
END $$;

-- Cleanup legacy links and tables when present.
ALTER TABLE IF EXISTS packing_tasks DROP COLUMN IF EXISTS sales_initial_invoice_id;
ALTER TABLE IF EXISTS sales_final_invoices DROP COLUMN IF EXISTS sales_initial_invoice_id;
DROP TABLE IF EXISTS sales_initial_invoice_items;
DROP TABLE IF EXISTS sales_initial_invoices;
