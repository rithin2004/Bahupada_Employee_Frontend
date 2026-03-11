CREATE TABLE IF NOT EXISTS product_brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(120) NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(120) NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_sub_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid REFERENCES product_categories(id),
    name varchar(120) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_sub_category_category_name UNIQUE (category_id, name)
);

ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_code varchar(20);
UPDATE units
SET unit_code = upper(left(regexp_replace(coalesce(unit_name, ''), '[^A-Za-z0-9]+', '', 'g'), 20))
WHERE coalesce(unit_code, '') = '';
ALTER TABLE units ALTER COLUMN unit_code SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'units_unit_code_key'
    ) THEN
        ALTER TABLE units ADD CONSTRAINT units_unit_code_key UNIQUE (unit_code);
    END IF;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES product_brands(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES product_categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category_id uuid REFERENCES product_sub_categories(id);

INSERT INTO product_brands (name)
SELECT DISTINCT trim(brand)
FROM products
WHERE trim(coalesce(brand, '')) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO product_categories (name)
SELECT DISTINCT trim(category)
FROM products
WHERE trim(coalesce(category, '')) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO product_sub_categories (category_id, name)
SELECT DISTINCT pc.id, trim(p.sub_category)
FROM products p
LEFT JOIN product_categories pc ON pc.name = trim(p.category)
WHERE trim(coalesce(p.sub_category, '')) <> ''
ON CONFLICT (category_id, name) DO NOTHING;

UPDATE products p
SET brand_id = pb.id
FROM product_brands pb
WHERE p.brand_id IS NULL
  AND trim(coalesce(p.brand, '')) <> ''
  AND pb.name = trim(p.brand);

UPDATE products p
SET category_id = pc.id
FROM product_categories pc
WHERE p.category_id IS NULL
  AND trim(coalesce(p.category, '')) <> ''
  AND pc.name = trim(p.category);

UPDATE products p
SET sub_category_id = psc.id
FROM product_sub_categories psc
LEFT JOIN product_categories pc ON pc.id = psc.category_id
WHERE p.sub_category_id IS NULL
  AND trim(coalesce(p.sub_category, '')) <> ''
  AND psc.name = trim(p.sub_category)
  AND (
      p.category_id IS NULL
      OR psc.category_id IS NULL
      OR psc.category_id = p.category_id
      OR pc.name = trim(coalesce(p.category, ''))
  );
