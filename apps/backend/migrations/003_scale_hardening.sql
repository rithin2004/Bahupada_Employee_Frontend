-- Scale hardening migration
-- Apply after 002_hardening_schema.sql

-- customer financial opening/current balances
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS current_balance numeric(18,4) NOT NULL DEFAULT 0;

-- soft delete columns for transactional tables
ALTER TABLE purchase_challans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE purchase_expiries ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE sales_initial_invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE sales_final_invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE sales_expiries ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE warehouse_transfers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- delivery tracking on final invoice
ALTER TABLE sales_final_invoices ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending';
ALTER TABLE sales_final_invoices ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- performance indexes
CREATE INDEX IF NOT EXISTS idx_inventory_batch_warehouse_product
    ON inventory_batches(warehouse_id, product_id, available_quantity);

CREATE INDEX IF NOT EXISTS idx_inventory_batch_expiry
    ON inventory_batches(expiry_date ASC NULLS LAST, available_quantity);

CREATE INDEX IF NOT EXISTS idx_sales_orders_date_status
    ON sales_orders(challan_date DESC, status);

CREATE INDEX IF NOT EXISTS idx_sales_orders_customer
    ON sales_orders(customer_id, challan_date DESC);

CREATE INDEX IF NOT EXISTS idx_packing_warehouse_status
    ON packing_tasks(warehouse_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_packing_packer
    ON packing_tasks(assigned_packer_id, status);

CREATE INDEX IF NOT EXISTS idx_delivery_run_date
    ON delivery_runs(run_date DESC, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_delivery_stops_sequence
    ON delivery_run_stops(delivery_run_id, stop_sequence);

CREATE INDEX IF NOT EXISTS idx_payments_customer_date
    ON payments(customer_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
    ON stock_movements(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_date
    ON ledger_entries(entry_date DESC, account_id);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference
    ON ledger_entries(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_sales_final_delivery_status
    ON sales_final_invoices(delivery_status, delivered_at DESC);

