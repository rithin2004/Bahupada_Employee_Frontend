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
    NULL,
    'admin',
    crypt('ChangeMe@123', gen_salt('bf')),
    0,
    NULL,
    NULL,
    NULL,
    TRUE,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1
    FROM users
    WHERE account_type = 'SYSTEM'::account_type
       OR username = 'admin'
);
