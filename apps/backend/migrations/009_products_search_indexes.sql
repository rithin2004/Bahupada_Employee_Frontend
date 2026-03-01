-- Speed up product search by SKU/name/display_name/brand.
-- Requires PostgreSQL pg_trgm extension.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
    ON products USING gin (lower(sku) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON products USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_display_name_trgm
    ON products USING gin (lower(display_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
    ON products USING gin (lower(brand) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_active_created
    ON products (is_active, created_at DESC);
