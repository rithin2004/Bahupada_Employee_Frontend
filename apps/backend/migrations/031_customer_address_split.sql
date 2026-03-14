ALTER TABLE customers ADD COLUMN IF NOT EXISTS street_address_1 text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS street_address_2 text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pincode text;
