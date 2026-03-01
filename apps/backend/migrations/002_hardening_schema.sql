-- Hardening migration: aligns baseline schema with expanded ERP model
-- Safe to run after 001_initial.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- companies enrichment
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS organization_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pan text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cin text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS alternate_phone text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS alternate_email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pincode text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS signature_path text;
UPDATE companies SET company_name = COALESCE(company_name, name);

-- reference masters
CREATE TABLE IF NOT EXISTS company_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    document_name text NOT NULL,
    document_type text NOT NULL,
    document_number text,
    issue_date date,
    expiry_date date,
    alert_before_days int,
    file_path text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS area_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area_name text NOT NULL UNIQUE,
    city text,
    state text,
    pincode text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    route_name text NOT NULL UNIQUE,
    area_id uuid NOT NULL REFERENCES area_master(id),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name text NOT NULL UNIQUE,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_name text NOT NULL,
    action_name text NOT NULL,
    description text
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id uuid NOT NULL REFERENCES roles(id),
    permission_id uuid NOT NULL REFERENCES permissions(id),
    can_create boolean NOT NULL DEFAULT false,
    can_read boolean NOT NULL DEFAULT true,
    can_update boolean NOT NULL DEFAULT false,
    can_delete boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_role_permission UNIQUE(role_id, permission_id)
);

-- warehouse/rack enrichment
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS pincode text;

CREATE TABLE IF NOT EXISTS racks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    rack_type text,
    number_of_rows int NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rack_rows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_id uuid NOT NULL REFERENCES racks(id),
    capacity numeric(18,4),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- employees/users hardening
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS dob date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender gender;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS alternate_phone text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS aadhaar_hash text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS driver_license_no text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS driver_license_expiry date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS driver_license_photo_path text;
UPDATE employees SET name = COALESCE(name, full_name);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    refresh_token_hash text NOT NULL,
    device_info text,
    ip_address text,
    revoked boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL,
    ip_address text,
    success boolean NOT NULL DEFAULT false,
    attempted_at timestamptz NOT NULL DEFAULT now()
);

-- product/catalog enrichment
CREATE TABLE IF NOT EXISTS units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_name text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hsn_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hsn_code text NOT NULL UNIQUE,
    description text,
    gst_percent numeric(5,2) NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_id uuid REFERENCES hsn_master(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_unit_id uuid REFERENCES units(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS secondary_unit_id uuid REFERENCES units(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS third_unit_id uuid REFERENCES units(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS conv_2_to_1 numeric(18,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS conv_3_to_2 numeric(18,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS conv_3_to_1 numeric(18,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_in_grams numeric(18,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bundle boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bundle_price_override numeric(18,4);

CREATE TABLE IF NOT EXISTS item_bundle_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_product_id uuid NOT NULL REFERENCES products(id),
    component_product_id uuid NOT NULL REFERENCES products(id),
    quantity numeric(18,4) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_bundle_component UNIQUE(bundle_product_id, component_product_id)
);

CREATE TABLE IF NOT EXISTS pricing (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id),
    mrp numeric(18,4) NOT NULL DEFAULT 0,
    cost_price numeric(18,4) NOT NULL DEFAULT 0,
    a_class_price numeric(18,4) NOT NULL DEFAULT 0,
    b_class_price numeric(18,4) NOT NULL DEFAULT 0,
    c_class_price numeric(18,4) NOT NULL DEFAULT 0,
    pct_diff_a_mrp numeric(8,4),
    pct_diff_b_mrp numeric(8,4),
    pct_diff_c_mrp numeric(8,4),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_pricing_product UNIQUE(product_id)
);

-- vendor/customer enrichment
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS firm_name text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gstin text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS alternate_phone text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pincode text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS ifsc_code text;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS outlet_name text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gstin text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES route_master(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_line_sale_outlet boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS vehicles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_no text NOT NULL UNIQUE,
    vehicle_name text,
    capacity_kg numeric(18,4),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- inventory hardening
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS rack_row_id uuid REFERENCES rack_rows(id);
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS available_quantity numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS reserved_quantity numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS damaged_quantity numeric(18,4) NOT NULL DEFAULT 0;
UPDATE inventory_batches SET available_quantity = quantity_on_hand WHERE available_quantity = 0;

CREATE TABLE IF NOT EXISTS warehouse_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    to_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id uuid NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text NOT NULL,
    quantity numeric(18,4) NOT NULL
);

-- procurement hardening
ALTER TABLE purchase_challans ADD COLUMN IF NOT EXISTS challan_number text;
ALTER TABLE purchase_challans ADD COLUMN IF NOT EXISTS challan_date date;
ALTER TABLE purchase_challans ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

ALTER TABLE purchase_challan_items ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE purchase_challan_items ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE purchase_challan_items ADD COLUMN IF NOT EXISTS purchase_price numeric(18,4);
ALTER TABLE purchase_challan_items ADD COLUMN IF NOT EXISTS gst_percent numeric(5,2);
ALTER TABLE purchase_challan_items ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);

ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id);
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS subtotal numeric(18,4);
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS gst_amount numeric(18,4);
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS total_amount numeric(18,4);
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

ALTER TABLE purchase_bill_items ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE purchase_bill_items ADD COLUMN IF NOT EXISTS purchase_price numeric(18,4);
UPDATE purchase_bill_items SET batch_number = batch_no WHERE batch_number IS NULL;

CREATE TABLE IF NOT EXISTS purchase_returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id uuid NOT NULL REFERENCES vendors(id),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    return_date date NOT NULL,
    reason text,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_return_id uuid NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text NOT NULL,
    quantity numeric(18,4) NOT NULL,
    purchase_price numeric(18,4)
);

CREATE TABLE IF NOT EXISTS purchase_expiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id uuid NOT NULL REFERENCES vendors(id),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    expiry_date date NOT NULL,
    reason text,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_expiry_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_expiry_id uuid NOT NULL REFERENCES purchase_expiries(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text NOT NULL,
    quantity numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS reorder_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand text,
    warehouse_scope text,
    warehouse_id uuid REFERENCES warehouses(id),
    days int,
    grace_days int,
    strategy text,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reorder_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reorder_id uuid NOT NULL REFERENCES reorder_logs(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    reorder_norm_qty numeric(18,4),
    stock_qty numeric(18,4),
    suggested_qty numeric(18,4),
    override_qty numeric(18,4),
    final_qty numeric(18,4),
    vendor_id uuid REFERENCES vendors(id)
);

-- sales hardening
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS salesman_id uuid REFERENCES employees(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES route_master(id);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS challan_date date;

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS batch_number text;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS selling_price numeric(18,4);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS gst_percent numeric(5,2);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS parent_bundle_id uuid REFERENCES sales_order_items(id);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS is_bundle_parent boolean NOT NULL DEFAULT false;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS is_bundle_child boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sales_initial_invoice_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_initial_invoice_id uuid NOT NULL REFERENCES sales_initial_invoices(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text,
    reserved_quantity numeric(18,4),
    picked_quantity numeric(18,4)
);

CREATE TABLE IF NOT EXISTS sales_final_invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_initial_invoice_id uuid NOT NULL REFERENCES sales_initial_invoices(id),
    invoice_number text NOT NULL UNIQUE,
    invoice_date date NOT NULL,
    subtotal numeric(18,4) NOT NULL DEFAULT 0,
    gst_amount numeric(18,4) NOT NULL DEFAULT 0,
    total_amount numeric(18,4) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'created',
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_final_invoice_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_final_invoice_id uuid NOT NULL REFERENCES sales_final_invoices(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text,
    quantity numeric(18,4) NOT NULL,
    selling_price numeric(18,4),
    gst_percent numeric(5,2),
    discount_percent numeric(5,2),
    total_amount numeric(18,4)
);

CREATE TABLE IF NOT EXISTS invoice_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_final_invoice_id uuid NOT NULL REFERENCES sales_final_invoices(id),
    version_number int NOT NULL,
    changed_by uuid REFERENCES users(id),
    change_reason text,
    snapshot_json text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_final_invoice_id uuid NOT NULL REFERENCES sales_final_invoices(id),
    return_date date NOT NULL,
    reason text,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text NOT NULL,
    quantity numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_expiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES customers(id),
    expiry_date date NOT NULL,
    reason text,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_expiry_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_expiry_id uuid NOT NULL REFERENCES sales_expiries(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    batch_number text NOT NULL,
    quantity numeric(18,4) NOT NULL
);

-- packing/delivery hardening
ALTER TABLE packing_tasks ADD COLUMN IF NOT EXISTS invoice_written_on_pack boolean NOT NULL DEFAULT false;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_attendance_daily') THEN
        ALTER TABLE attendance_logs ADD CONSTRAINT uq_attendance_daily UNIQUE (employee_id, attendance_date);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS delivery_daily_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_plan_id uuid NOT NULL REFERENCES delivery_monthly_plans(id),
    duty_date date NOT NULL,
    vehicle_id uuid REFERENCES vehicles(id),
    driver_id uuid REFERENCES employees(id),
    helper_id uuid REFERENCES employees(id),
    bill_manager_id uuid REFERENCES employees(id),
    loader_id uuid REFERENCES employees(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery_runs ADD COLUMN IF NOT EXISTS route_engine text;
ALTER TABLE delivery_run_stops ADD COLUMN IF NOT EXISTS eta_at timestamptz;

-- planning/hr/promotions
CREATE TABLE IF NOT EXISTS salesman_weekly_planner (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salesman_id uuid NOT NULL REFERENCES employees(id),
    route_id uuid NOT NULL REFERENCES route_master(id),
    day_of_week int NOT NULL
);

CREATE TABLE IF NOT EXISTS driver_vehicle_planner (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid NOT NULL REFERENCES employees(id),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id),
    duty_date date NOT NULL
);

CREATE TABLE IF NOT EXISTS salary (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(id),
    basic numeric(18,4) NOT NULL DEFAULT 0,
    allowance numeric(18,4) NOT NULL DEFAULT 0,
    deductions numeric(18,4) NOT NULL DEFAULT 0,
    net_salary numeric(18,4) NOT NULL DEFAULT 0,
    month int NOT NULL,
    year int NOT NULL,
    paid_status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_salary_month UNIQUE(employee_id, month, year)
);

CREATE TABLE IF NOT EXISTS schemes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_name text NOT NULL,
    scheme_type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheme_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id uuid NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    free_quantity numeric(18,4),
    discount_percent numeric(5,2)
);

-- finance hardening
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name text NOT NULL,
    account_type text NOT NULL,
    parent_account_id uuid REFERENCES chart_of_accounts(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES chart_of_accounts(id);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ledger_debit_non_negative') THEN
        ALTER TABLE ledger_entries ADD CONSTRAINT ck_ledger_debit_non_negative CHECK (debit >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ledger_credit_non_negative') THEN
        ALTER TABLE ledger_entries ADD CONSTRAINT ck_ledger_credit_non_negative CHECK (credit >= 0);
    END IF;
END $$;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_mode text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date date;

CREATE TABLE IF NOT EXISTS credit_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_invoice_id uuid,
    amount numeric(18,4) NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS debit_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_invoice_id uuid,
    amount numeric(18,4) NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- observability/safety
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES users(id),
    action text NOT NULL,
    entity_name text NOT NULL,
    entity_id uuid,
    old_values text,
    new_values text,
    trace_id text,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL,
    endpoint text NOT NULL,
    request_hash text NOT NULL,
    response_code int,
    response_body text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_idempotency_key_endpoint UNIQUE(key, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_route_date ON sales_orders(route_id, challan_date);
CREATE INDEX IF NOT EXISTS idx_delivery_daily_assignments_date ON delivery_daily_assignments(duty_date);
CREATE INDEX IF NOT EXISTS idx_invoice_versions_invoice_version ON invoice_versions(sales_final_invoice_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_name, entity_id, occurred_at DESC);
