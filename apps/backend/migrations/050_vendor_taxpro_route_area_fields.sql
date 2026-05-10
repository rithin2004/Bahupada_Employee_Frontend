ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS street_address_1 text,
ADD COLUMN IF NOT EXISTS street_address_2 text,
ADD COLUMN IF NOT EXISTS street_address_3 text,
ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES area_master(id),
ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES route_master(id);

UPDATE vendors
SET street_address_1 = COALESCE(street_address_1, street)
WHERE street IS NOT NULL
  AND street_address_1 IS NULL;

INSERT INTO account_categories (code, name, party_type, description, is_active)
SELECT 'SUNDRY_CREDITORS', 'SUNDRY CREDITORS', 'VENDOR'::party_type, 'Default vendor account category', TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM account_categories
    WHERE party_type = 'VENDOR'::party_type
      AND (
          upper(name) = 'SUNDRY CREDITORS'
          OR upper(code) IN ('SUNDRY_CREDITORS', 'SUNDRY-CREDITORS')
      )
);

UPDATE vendors
SET account_category_id = (
    SELECT id
    FROM account_categories
    WHERE party_type = 'VENDOR'::party_type
      AND (
          upper(name) = 'SUNDRY CREDITORS'
          OR upper(code) IN ('SUNDRY_CREDITORS', 'SUNDRY-CREDITORS')
      )
    ORDER BY created_at ASC
    LIMIT 1
)
WHERE account_category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_area_id
    ON vendors (area_id);

CREATE INDEX IF NOT EXISTS idx_vendors_route_id
    ON vendors (route_id);
