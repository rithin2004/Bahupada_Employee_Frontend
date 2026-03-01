-- Performance indexes for common admin/customer listing APIs.
-- Focus: pagination by created_at and ILIKE search columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Generic active-list pagination indexes
CREATE INDEX IF NOT EXISTS idx_customers_active_created ON customers (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendors_active_created ON vendors (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouses_active_created ON warehouses (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_racks_active_created ON racks (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_active_created ON employees (is_active, created_at DESC);

-- Sales orders list base filter/sort
CREATE INDEX IF NOT EXISTS idx_sales_orders_deleted_created ON sales_orders (deleted_at, created_at DESC);

-- Trigram indexes for ILIKE search-heavy endpoints
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm ON vendors USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_firm_name_trgm ON vendors USING gin (firm_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_city_trgm ON vendors USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_phone_trgm ON vendors USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_employees_full_name_trgm ON employees USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_employees_phone_trgm ON employees USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sales_orders_invoice_trgm ON sales_orders USING gin (invoice_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_warehouses_name_trgm ON warehouses USING gin (name gin_trgm_ops);
