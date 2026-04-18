-- Add multi-unit quantities, pricing fields, and line totals to purchase_challan_items
-- This aligns the schema with PurchaseBillItem structure

ALTER TABLE purchase_challan_items
ADD COLUMN IF NOT EXISTS quantity_1st NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS quantity_2nd NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS quantity_3rd NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS unit_1st_id UUID REFERENCES units(id),
ADD COLUMN IF NOT EXISTS unit_2nd_id UUID REFERENCES units(id),
ADD COLUMN IF NOT EXISTS unit_3rd_id UUID REFERENCES units(id),
ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS damaged_quantity NUMERIC(18, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rate_value NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS rate_unit_level INTEGER,
ADD COLUMN IF NOT EXISTS discount_lumpsum NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS line_subtotal NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS line_discount_amount NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS line_taxable_amount NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS line_tax_amount NUMERIC(18, 4),
ADD COLUMN IF NOT EXISTS line_total_amount NUMERIC(18, 4);

-- Update discount_percent precision to match PurchaseBillItem
ALTER TABLE purchase_challan_items
ALTER COLUMN discount_percent TYPE NUMERIC(8, 4);
