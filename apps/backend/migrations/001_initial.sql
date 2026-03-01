-- Initial schema baseline for Bahu ERP
-- Run with psql against PostgreSQL (Neon/RDS compatible)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE employee_role AS ENUM (
        'ADMIN', 'PACKER', 'SUPERVISOR', 'SALESMAN', 'DRIVER', 'IN_VEHICLE_HELPER', 'BILL_MANAGER', 'LOADER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE customer_class AS ENUM (
        'B2B_DISTRIBUTOR', 'B2B_SEMI_WHOLESALE', 'B2B_TOP_OUTLET', 'B2B_MASS_GROCERY', 'B2C'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_source AS ENUM ('ADMIN', 'SALESMAN', 'CUSTOMER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_move_type AS ENUM ('IN', 'OUT', 'ADJUST', 'RETURN', 'EXPIRY', 'RESERVE', 'RELEASE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    gstin text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    full_name text NOT NULL,
    role employee_role NOT NULL,
    phone text NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid REFERENCES employees(id),
    email text UNIQUE,
    phone text UNIQUE,
    password_hash text NOT NULL,
    failed_login_attempts int NOT NULL DEFAULT 0,
    locked_until timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    phone text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    customer_class customer_class NOT NULL,
    route_name text,
    credit_limit numeric(18,4) NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text NOT NULL UNIQUE,
    name text NOT NULL,
    unit text NOT NULL,
    base_price numeric(18,4) NOT NULL DEFAULT 0,
    tax_percent numeric(5,2) NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_challans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    vendor_id uuid NOT NULL REFERENCES vendors(id),
    reference_no text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_challan_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_challan_id uuid NOT NULL REFERENCES purchase_challans(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    quantity numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_challan_id uuid NOT NULL REFERENCES purchase_challans(id),
    bill_number text NOT NULL UNIQUE,
    bill_date date NOT NULL,
    posted boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_bill_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_bill_id uuid NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_no text NOT NULL,
    expiry_date date,
    quantity numeric(18,4) NOT NULL,
    unit_price numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    product_id uuid NOT NULL REFERENCES products(id),
    batch_no text NOT NULL,
    expiry_date date,
    quantity_on_hand numeric(18,4) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_inventory_batch UNIQUE (warehouse_id, product_id, batch_no)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    product_id uuid NOT NULL REFERENCES products(id),
    batch_no text NOT NULL,
    move_type stock_move_type NOT NULL,
    quantity numeric(18,4) NOT NULL,
    reference_type text NOT NULL,
    reference_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    customer_id uuid NOT NULL REFERENCES customers(id),
    source order_source NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    quantity numeric(18,4) NOT NULL,
    unit_price numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_initial_invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
    invoice_number text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'created',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packing_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_initial_invoice_id uuid NOT NULL REFERENCES sales_initial_invoices(id),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    assigned_packer_id uuid REFERENCES employees(id),
    assigned_supervisor_id uuid REFERENCES employees(id),
    status text NOT NULL DEFAULT 'pending',
    pack_label text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(id),
    attendance_date date NOT NULL,
    is_active_for_shift boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS delivery_monthly_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_name text NOT NULL UNIQUE,
    month int NOT NULL,
    year int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    run_date date NOT NULL,
    optimized boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_run_stops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_run_id uuid NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
    stop_sequence int NOT NULL,
    reverse_load_sequence int NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_run_id uuid NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
    driver_id uuid NOT NULL REFERENCES employees(id),
    helper_id uuid NOT NULL REFERENCES employees(id),
    bill_manager_id uuid NOT NULL REFERENCES employees(id),
    loader_id uuid NOT NULL REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS pod_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_run_stop_id uuid NOT NULL REFERENCES delivery_run_stops(id),
    status text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES customers(id),
    amount numeric(18,4) NOT NULL,
    mode text NOT NULL,
    reference_type text NOT NULL,
    reference_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name text NOT NULL,
    debit numeric(18,4) NOT NULL DEFAULT 0,
    credit numeric(18,4) NOT NULL DEFAULT 0,
    reference_type text NOT NULL,
    reference_id uuid,
    entry_date date NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_wh_status_created ON sales_orders (warehouse_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packing_tasks_wh_status_created ON packing_tasks (warehouse_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_date ON delivery_runs (run_date);
CREATE INDEX IF NOT EXISTS idx_payments_customer_created ON payments (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements (created_at DESC);
