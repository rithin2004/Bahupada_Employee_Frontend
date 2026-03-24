ALTER TABLE purchase_bills
    ADD COLUMN IF NOT EXISTS received_date date,
    ADD COLUMN IF NOT EXISTS payment_mode text,
    ADD COLUMN IF NOT EXISTS tax_type text,
    ADD COLUMN IF NOT EXISTS freight_amount numeric(18,4),
    ADD COLUMN IF NOT EXISTS entry_number text,
    ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE purchase_bill_items
    ADD COLUMN IF NOT EXISTS quantity_1st numeric(18,4),
    ADD COLUMN IF NOT EXISTS quantity_2nd numeric(18,4),
    ADD COLUMN IF NOT EXISTS quantity_3rd numeric(18,4),
    ADD COLUMN IF NOT EXISTS unit_1st_id uuid REFERENCES units(id),
    ADD COLUMN IF NOT EXISTS unit_2nd_id uuid REFERENCES units(id),
    ADD COLUMN IF NOT EXISTS unit_3rd_id uuid REFERENCES units(id),
    ADD COLUMN IF NOT EXISTS base_quantity numeric(18,4),
    ADD COLUMN IF NOT EXISTS rate_value numeric(18,4),
    ADD COLUMN IF NOT EXISTS rate_unit_level integer,
    ADD COLUMN IF NOT EXISTS discount_percent numeric(8,4),
    ADD COLUMN IF NOT EXISTS discount_lumpsum numeric(18,4),
    ADD COLUMN IF NOT EXISTS line_subtotal numeric(18,4),
    ADD COLUMN IF NOT EXISTS line_discount_amount numeric(18,4),
    ADD COLUMN IF NOT EXISTS line_taxable_amount numeric(18,4),
    ADD COLUMN IF NOT EXISTS line_tax_amount numeric(18,4),
    ADD COLUMN IF NOT EXISTS line_total_amount numeric(18,4);

UPDATE purchase_bill_items
SET
    base_quantity = COALESCE(base_quantity, quantity),
    quantity_1st = COALESCE(quantity_1st, quantity),
    line_subtotal = COALESCE(line_subtotal, quantity * unit_price),
    line_taxable_amount = COALESCE(line_taxable_amount, quantity * unit_price),
    line_total_amount = COALESCE(line_total_amount, quantity * unit_price)
WHERE base_quantity IS NULL
   OR quantity_1st IS NULL
   OR line_subtotal IS NULL
   OR line_taxable_amount IS NULL
   OR line_total_amount IS NULL;

UPDATE purchase_bills
SET freight_amount = COALESCE(freight_amount, 0)
WHERE freight_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_bills_received_date ON purchase_bills (received_date);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_entry_number ON purchase_bills (entry_number);
