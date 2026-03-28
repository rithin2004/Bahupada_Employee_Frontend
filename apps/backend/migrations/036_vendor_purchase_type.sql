ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendors_purchase_type_check'
  ) THEN
    ALTER TABLE vendors
    ADD CONSTRAINT vendors_purchase_type_check
    CHECK (purchase_type IS NULL OR purchase_type IN ('LOCAL', 'CENTRAL'));
  END IF;
END $$;
