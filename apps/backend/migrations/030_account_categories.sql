CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS account_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    party_type party_type NOT NULL,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS account_category_id UUID NULL;

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS account_category_id UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'vendors'
          AND constraint_name = 'fk_vendors_account_category_id'
    ) THEN
        ALTER TABLE vendors
            ADD CONSTRAINT fk_vendors_account_category_id
            FOREIGN KEY (account_category_id) REFERENCES account_categories(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'customers'
          AND constraint_name = 'fk_customers_account_category_id'
    ) THEN
        ALTER TABLE customers
            ADD CONSTRAINT fk_customers_account_category_id
            FOREIGN KEY (account_category_id) REFERENCES account_categories(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_categories_party_type_active
    ON account_categories (party_type, is_active, name);

CREATE INDEX IF NOT EXISTS idx_vendors_account_category_id
    ON vendors (account_category_id);

CREATE INDEX IF NOT EXISTS idx_customers_account_category_id
    ON customers (account_category_id);
