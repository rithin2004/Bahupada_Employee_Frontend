-- Make idempotency uniqueness scoped by endpoint

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_idempotency_key'
          AND conrelid = 'idempotency_keys'::regclass
    ) THEN
        ALTER TABLE idempotency_keys DROP CONSTRAINT uq_idempotency_key;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_idempotency_key_endpoint'
          AND conrelid = 'idempotency_keys'::regclass
    ) THEN
        ALTER TABLE idempotency_keys
            ADD CONSTRAINT uq_idempotency_key_endpoint UNIQUE (key, endpoint);
    END IF;
END $$;
