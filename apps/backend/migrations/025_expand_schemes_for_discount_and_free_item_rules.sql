ALTER TABLE schemes
    ADD COLUMN IF NOT EXISTS customer_category_id UUID,
    ADD COLUMN IF NOT EXISTS condition_basis VARCHAR(20),
    ADD COLUMN IF NOT EXISTS threshold_value NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS threshold_unit VARCHAR(10),
    ADD COLUMN IF NOT EXISTS brand VARCHAR(120),
    ADD COLUMN IF NOT EXISTS category VARCHAR(120),
    ADD COLUMN IF NOT EXISTS sub_category VARCHAR(120),
    ADD COLUMN IF NOT EXISTS product_id UUID,
    ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS reward_discount_percent NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS reward_product_id UUID,
    ADD COLUMN IF NOT EXISTS reward_product_quantity NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS note TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_schemes_customer_category'
    ) THEN
        ALTER TABLE schemes
            ADD CONSTRAINT fk_schemes_customer_category
            FOREIGN KEY (customer_category_id) REFERENCES customer_categories(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_schemes_product'
    ) THEN
        ALTER TABLE schemes
            ADD CONSTRAINT fk_schemes_product
            FOREIGN KEY (product_id) REFERENCES products(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_schemes_reward_product'
    ) THEN
        ALTER TABLE schemes
            ADD CONSTRAINT fk_schemes_reward_product
            FOREIGN KEY (reward_product_id) REFERENCES products(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schemes_customer_category ON schemes(customer_category_id);
CREATE INDEX IF NOT EXISTS idx_schemes_product_id ON schemes(product_id);
CREATE INDEX IF NOT EXISTS idx_schemes_reward_product_id ON schemes(reward_product_id);
CREATE INDEX IF NOT EXISTS idx_schemes_active_dates ON schemes(is_active, start_date, end_date);
