ALTER TABLE purchase_bills
    ADD COLUMN IF NOT EXISTS warehouse_id UUID,
    ADD COLUMN IF NOT EXISTS rack_id UUID;

UPDATE purchase_bills pb
SET warehouse_id = pc.warehouse_id,
    rack_id = COALESCE(pb.rack_id, pc.rack_id)
FROM purchase_challans pc
WHERE pb.purchase_challan_id = pc.id
  AND pb.warehouse_id IS NULL;

ALTER TABLE purchase_bills
    ALTER COLUMN purchase_challan_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_purchase_bills_warehouse'
          AND table_name = 'purchase_bills'
    ) THEN
        ALTER TABLE purchase_bills
            ADD CONSTRAINT fk_purchase_bills_warehouse
                FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_purchase_bills_rack'
          AND table_name = 'purchase_bills'
    ) THEN
        ALTER TABLE purchase_bills
            ADD CONSTRAINT fk_purchase_bills_rack
                FOREIGN KEY (rack_id) REFERENCES racks(id);
    END IF;
END $$;

ALTER TABLE purchase_bills
    ALTER COLUMN warehouse_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_bills_warehouse_id ON purchase_bills (warehouse_id);
