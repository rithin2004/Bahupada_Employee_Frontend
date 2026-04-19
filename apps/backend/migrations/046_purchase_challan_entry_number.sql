-- Purchase challan entry number (parity with purchase_bills.entry_number for UI)
ALTER TABLE purchase_challans ADD COLUMN IF NOT EXISTS entry_number VARCHAR(50);
UPDATE purchase_challans
SET entry_number = reference_no
WHERE entry_number IS NULL AND reference_no IS NOT NULL;
