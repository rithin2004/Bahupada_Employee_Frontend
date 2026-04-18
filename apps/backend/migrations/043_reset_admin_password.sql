-- Reset default admin password (bcrypt) and clear lockouts; also INSERT admin if missing (empty users table).
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
    WHERE username = 'admin'
       OR lower(email) = lower('admin@bahu.local')
);

UPDATE users
SET
    password_hash = crypt('ChangeMe@123', gen_salt('bf')),
    failed_login_attempts = 0,
    locked_until = NULL,
    account_locked_until = NULL,
    is_active = TRUE,
    is_super_admin = TRUE
WHERE account_type IN ('EMPLOYEE'::account_type, 'SYSTEM'::account_type)
  AND (
      username = 'admin'
      OR lower(email) = lower('admin@bahu.local')
  );
