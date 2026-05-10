ALTER TABLE purchase_bill_items
  ADD COLUMN IF NOT EXISTS discount_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS free_buy_quantity NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS effective_unit_cost NUMERIC(18,4);

ALTER TABLE purchase_challan_items
  ADD COLUMN IF NOT EXISTS discount_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS free_buy_quantity NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS effective_unit_cost NUMERIC(18,4);

UPDATE purchase_bill_items
SET
  discount_mode = COALESCE(discount_mode, 'PERCENT'),
  effective_unit_cost = COALESCE(
    effective_unit_cost,
    CASE
      WHEN COALESCE(base_quantity, quantity, 0) > 0
      THEN COALESCE(line_taxable_amount, line_subtotal, purchase_price * COALESCE(base_quantity, quantity, 0), 0)
        / COALESCE(base_quantity, quantity)
      ELSE NULL
    END
  )
WHERE discount_mode IS NULL OR effective_unit_cost IS NULL;

UPDATE purchase_challan_items
SET
  discount_mode = COALESCE(discount_mode, 'PERCENT'),
  effective_unit_cost = COALESCE(
    effective_unit_cost,
    CASE
      WHEN COALESCE(base_quantity, quantity, 0) > 0
      THEN COALESCE(line_taxable_amount, line_subtotal, purchase_price * COALESCE(base_quantity, quantity, 0), 0)
        / COALESCE(base_quantity, quantity)
      ELSE NULL
    END
  )
WHERE discount_mode IS NULL OR effective_unit_cost IS NULL;
