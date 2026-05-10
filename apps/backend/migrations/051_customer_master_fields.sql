ALTER TABLE customers
ADD COLUMN IF NOT EXISTS tax_type text,
ADD COLUMN IF NOT EXISTS street_address_3 text,
ADD COLUMN IF NOT EXISTS owner_birthday date,
ADD COLUMN IF NOT EXISTS marital_status text,
ADD COLUMN IF NOT EXISTS anniversary date,
ADD COLUMN IF NOT EXISTS price_class varchar(1);

UPDATE customers
SET tax_type = CASE
    WHEN coalesce(gst_number, gstin) IS NOT NULL AND length(coalesce(gst_number, gstin)) >= 2
         AND EXISTS (
             SELECT 1
             FROM companies c
             WHERE c.is_active = TRUE
               AND c.gstin IS NOT NULL
               AND left(c.gstin, 2) = left(coalesce(customers.gst_number, customers.gstin), 2)
         )
    THEN 'LOCAL'
    ELSE 'CENTRAL'
END
WHERE tax_type IS NULL;

UPDATE customers
SET price_class = CASE
    WHEN customer_type = 'B2C' THEN 'C'
    ELSE 'A'
END
WHERE price_class IS NULL;

UPDATE customers c
SET price_class = cc.price_class
FROM customer_categories cc
WHERE c.customer_category_id = cc.id
  AND c.price_class IS DISTINCT FROM cc.price_class;

INSERT INTO account_categories (code, name, party_type, description, is_active)
SELECT 'SUNDRY_DEBTORS', 'SUNDRY DEBTORS', 'CUSTOMER'::party_type, 'Default customer account category', TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM account_categories
    WHERE party_type = 'CUSTOMER'::party_type
      AND (
          upper(name) = 'SUNDRY DEBTORS'
          OR upper(code) IN ('SUNDRY_DEBTORS', 'SUNDRY-DEBTORS')
      )
);

UPDATE customers
SET account_category_id = (
    SELECT id
    FROM account_categories
    WHERE party_type = 'CUSTOMER'::party_type
      AND (
          upper(name) = 'SUNDRY DEBTORS'
          OR upper(code) IN ('SUNDRY_DEBTORS', 'SUNDRY-DEBTORS')
      )
    ORDER BY created_at ASC
    LIMIT 1
)
WHERE account_category_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'customers_tax_type_check'
    ) THEN
        ALTER TABLE customers
        ADD CONSTRAINT customers_tax_type_check
        CHECK (tax_type IS NULL OR tax_type IN ('LOCAL', 'CENTRAL'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'customers_marital_status_check'
    ) THEN
        ALTER TABLE customers
        ADD CONSTRAINT customers_marital_status_check
        CHECK (marital_status IS NULL OR marital_status IN ('MARRIED', 'UNMARRIED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'customers_price_class_check'
    ) THEN
        ALTER TABLE customers
        ADD CONSTRAINT customers_price_class_check
        CHECK (price_class IS NULL OR price_class IN ('A', 'B', 'C'));
    END IF;
END $$;
