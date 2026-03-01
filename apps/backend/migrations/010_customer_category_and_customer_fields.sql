-- Customer schema expansion:
-- - customer_categories table for customer type/category -> price class mapping
-- - customer fields: pan/gst docs, whatsapp/alternate numbers, customer_type/category

DO $$
BEGIN
    CREATE TYPE customer_type AS ENUM ('B2B', 'B2C');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END$$;

CREATE TABLE IF NOT EXISTS customer_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL UNIQUE,
    customer_type customer_type NOT NULL DEFAULT 'B2B',
    price_class VARCHAR(1) NOT NULL DEFAULT 'A',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_customer_categories_price_class CHECK (price_class IN ('A', 'B', 'C'))
);

ALTER TABLE customer_categories
    ADD COLUMN IF NOT EXISTS price_class VARCHAR(1);

UPDATE customer_categories
SET price_class = CASE
    WHEN code = 'DISTRIBUTOR_WHOLESALER' THEN 'B'
    WHEN customer_type = 'B2C' THEN 'C'
    ELSE 'A'
END
WHERE price_class IS NULL;

ALTER TABLE customer_categories
    ALTER COLUMN price_class SET DEFAULT 'A';

INSERT INTO customer_categories (code, name, customer_type, price_class)
VALUES
    ('DISTRIBUTOR', 'Distributor', 'B2B', 'B'),
    ('WHOLESALER', 'Wholesaler', 'B2B', 'B'),
    ('SEMI_WHOLESALE', 'Semi-Wholesale', 'B2B', 'A'),
    ('TOP_OUTLETS', 'Top Outlets', 'B2B', 'A'),
    ('MASS_GROCERIES', 'Mass Groceries', 'B2B', 'A'),
    ('B2C', 'B2C', 'B2C', 'C')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, customer_type = EXCLUDED.customer_type, price_class = EXCLUDED.price_class;

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS pan_number VARCHAR(16),
    ADD COLUMN IF NOT EXISTS pan_doc VARCHAR(512),
    ADD COLUMN IF NOT EXISTS gst_number VARCHAR(32),
    ADD COLUMN IF NOT EXISTS gst_doc VARCHAR(512),
    ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS alternate_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS customer_type customer_type,
    ADD COLUMN IF NOT EXISTS customer_category_id UUID;

UPDATE customers
SET gst_number = COALESCE(gst_number, gstin)
WHERE gst_number IS NULL;

UPDATE customers
SET whatsapp_number = COALESCE(whatsapp_number, phone)
WHERE whatsapp_number IS NULL;

UPDATE customers
SET customer_type = CASE
    WHEN customer_class = 'B2C' THEN 'B2C'::customer_type
    ELSE 'B2B'::customer_type
END
WHERE customer_type IS NULL;

UPDATE customers c
SET customer_category_id = cc.id
FROM customer_categories cc
WHERE c.customer_category_id IS NULL
  AND (
      (c.customer_class = 'B2B_DISTRIBUTOR' AND cc.code = 'DISTRIBUTOR')
      OR (c.customer_class = 'B2B_SEMI_WHOLESALE' AND cc.code = 'SEMI_WHOLESALE')
      OR (c.customer_class = 'B2B_TOP_OUTLET' AND cc.code = 'TOP_OUTLETS')
      OR (c.customer_class = 'B2B_MASS_GROCERY' AND cc.code = 'MASS_GROCERIES')
      OR (c.customer_class = 'B2C' AND cc.code = 'B2C')
  );

ALTER TABLE customers
    ALTER COLUMN customer_type SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'customers'
          AND constraint_name = 'fk_customers_customer_category'
    ) THEN
        ALTER TABLE customers
            ADD CONSTRAINT fk_customers_customer_category
            FOREIGN KEY (customer_category_id) REFERENCES customer_categories(id);
    END IF;
END$$;
