-- Add missing gender column to customers table
-- The entity model defines it but it was never added via migration.

DO $$
BEGIN
    -- Ensure gender enum type exists (already created for employees)
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender') THEN
        CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'OTHER');
    END IF;
END $$;

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS gender gender;
