ALTER TABLE purchase_challans
ADD COLUMN IF NOT EXISTS rack_id UUID REFERENCES racks(id);

ALTER TABLE purchase_challan_items
ADD COLUMN IF NOT EXISTS rack_id UUID REFERENCES racks(id);

ALTER TABLE purchase_bill_items
ADD COLUMN IF NOT EXISTS damaged_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE inventory_batches
DROP COLUMN IF EXISTS quantity_on_hand;
