-- Make unit_price nullable in purchase_challan_items to allow creation without unit price
ALTER TABLE purchase_challan_items
ALTER COLUMN unit_price DROP NOT NULL;
