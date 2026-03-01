-- Pricing precedence tables + FEFO helper indexes

CREATE TABLE IF NOT EXISTS customer_product_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES customers(id),
    product_id uuid NOT NULL REFERENCES products(id),
    price numeric(18,4) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_customer_product_price UNIQUE(customer_id, product_id)
);

CREATE TABLE IF NOT EXISTS route_product_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id uuid NOT NULL REFERENCES route_master(id),
    product_id uuid NOT NULL REFERENCES products(id),
    price numeric(18,4) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_route_product_price UNIQUE(route_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_product_price_active
    ON customer_product_prices(customer_id, product_id, is_active);

CREATE INDEX IF NOT EXISTS idx_route_product_price_active
    ON route_product_prices(route_id, product_id, is_active);

CREATE INDEX IF NOT EXISTS idx_scheme_product_active_range
    ON schemes(is_active, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_sales_initial_items_invoice
    ON sales_initial_invoice_items(sales_initial_invoice_id, product_id, batch_number);
