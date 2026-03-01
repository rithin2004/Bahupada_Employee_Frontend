-- Split combined Distributor/Wholesaler customer category into two separate categories.
-- Safe for already-migrated databases.

DO $$
DECLARE
    old_id UUID;
    distributor_id UUID;
BEGIN
    SELECT id INTO old_id FROM customer_categories WHERE code = 'DISTRIBUTOR_WHOLESALER' LIMIT 1;
    SELECT id INTO distributor_id FROM customer_categories WHERE code = 'DISTRIBUTOR' LIMIT 1;

    IF old_id IS NOT NULL THEN
        IF distributor_id IS NULL THEN
            UPDATE customer_categories
            SET code = 'DISTRIBUTOR',
                name = 'Distributor',
                customer_type = 'B2B'::customer_type,
                price_class = 'B'
            WHERE id = old_id;
            distributor_id := old_id;
        ELSE
            UPDATE customers
            SET customer_category_id = distributor_id
            WHERE customer_category_id = old_id;

            DELETE FROM customer_categories
            WHERE id = old_id;
        END IF;
    END IF;
END$$;

INSERT INTO customer_categories (code, name, customer_type, price_class)
VALUES
    ('DISTRIBUTOR', 'Distributor', 'B2B', 'B'),
    ('WHOLESALER', 'Wholesaler', 'B2B', 'B')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    customer_type = EXCLUDED.customer_type,
    price_class = EXCLUDED.price_class;
