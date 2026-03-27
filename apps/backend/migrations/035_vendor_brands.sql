CREATE TABLE IF NOT EXISTS vendor_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  brand_id UUID NOT NULL REFERENCES product_brands(id),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vendor_brand UNIQUE (vendor_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_brands_vendor_id ON vendor_brands(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_brands_brand_id ON vendor_brands(brand_id);
CREATE INDEX IF NOT EXISTS idx_vendor_brands_active ON vendor_brands(is_active);

WITH ranked_vendors AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM vendors
  WHERE is_active IS TRUE
),
ranked_brands AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM product_brands
  WHERE is_active IS TRUE
),
sample_links AS (
  SELECT v.id AS vendor_id, b.id AS brand_id, (v.rn = 1) AS is_primary
  FROM ranked_vendors v
  JOIN ranked_brands b ON b.rn = v.rn
  WHERE v.rn <= 2
)
INSERT INTO vendor_brands (vendor_id, brand_id, is_primary, is_active)
SELECT vendor_id, brand_id, is_primary, TRUE
FROM sample_links
ON CONFLICT (vendor_id, brand_id) DO NOTHING;
