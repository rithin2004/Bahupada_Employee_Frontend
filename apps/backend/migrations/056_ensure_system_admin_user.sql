-- Ensure SYSTEM bootstrap user exists: username admin, password ChangeMe@123, email admin@bahu.local.
-- Idempotent: inserts when missing; updates password + clears lockouts for username admin.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (
    id,
    employee_id,
    customer_id,
    account_type,
    phone,
    email,
    username,
    password_hash,
    failed_login_attempts,
    account_locked_until,
    locked_until,
    last_login,
    is_super_admin,
    is_active,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    NULL,
    NULL,
    'SYSTEM'::account_type,
    NULL,
    'admin@bahu.local',
    'admin',
    crypt('ChangeMe@123', gen_salt('bf')),
    0,
    NULL,
    NULL,
    NULL,
    TRUE,
    TRUE,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1
    FROM users
    WHERE lower(username) = lower('admin')
);

UPDATE users
SET
    password_hash = crypt('ChangeMe@123', gen_salt('bf')),
    failed_login_attempts = 0,
    locked_until = NULL,
    account_locked_until = NULL,
    is_active = TRUE,
    account_type = 'SYSTEM'::account_type,
    email = COALESCE(NULLIF(trim(email), ''), 'admin@bahu.local'),
    is_super_admin = TRUE,
    updated_at = now()
WHERE lower(username) = lower('admin');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'password_set_at'
    ) THEN
        EXECUTE $set$
            UPDATE users
            SET password_set_at = COALESCE(password_set_at, now())
            WHERE lower(username) = lower('admin')
              AND password_hash IS NOT NULL
        $set$;
    END IF;
END $$;

COMMIT;
