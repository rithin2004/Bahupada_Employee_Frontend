CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_users_customer_id'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT uq_users_customer_id UNIQUE (customer_id);
    END IF;
END $$;

UPDATE users u
SET username = LEFT(
    REGEXP_REPLACE(
        LOWER(COALESCE(e.email, e.full_name, COALESCE(e.phone, 'employee'))),
        '[^a-z0-9]+',
        '.',
        'g'
    ),
    72
) || '.' || RIGHT(REPLACE(e.id::text, '-', ''), 4)
FROM employees e
WHERE u.username IS NULL
  AND u.employee_id = e.id;

UPDATE users u
SET username = LEFT(
    REGEXP_REPLACE(
        LOWER(COALESCE(c.email, c.name, COALESCE(c.whatsapp_number, c.phone, 'customer'))),
        '[^a-z0-9]+',
        '.',
        'g'
    ),
    72
) || '.' || RIGHT(REPLACE(c.id::text, '-', ''), 4)
FROM customers c
WHERE u.username IS NULL
  AND u.customer_id = c.id;

INSERT INTO users (
    id,
    employee_id,
    account_type,
    phone,
    email,
    username,
    password_hash,
    is_active,
    failed_login_attempts,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    e.id,
    'EMPLOYEE'::account_type,
    e.phone,
    e.email,
    LEFT(
        REGEXP_REPLACE(
            LOWER(COALESCE(e.email, e.full_name, COALESCE(e.phone, 'employee'))),
            '[^a-z0-9]+',
            '.',
            'g'
        ),
        72
    ) || '.' || RIGHT(REPLACE(e.id::text, '-', ''), 4),
    crypt('ChangeMe@123', gen_salt('bf')),
    e.is_active,
    0,
    now(),
    now()
FROM employees e
LEFT JOIN users u ON u.employee_id = e.id
WHERE u.id IS NULL;

INSERT INTO users (
    id,
    customer_id,
    account_type,
    phone,
    email,
    username,
    password_hash,
    is_active,
    failed_login_attempts,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    c.id,
    'CUSTOMER'::account_type,
    COALESCE(c.whatsapp_number, c.phone),
    c.email,
    LEFT(
        REGEXP_REPLACE(
            LOWER(COALESCE(c.email, c.name, COALESCE(c.whatsapp_number, c.phone, 'customer'))),
            '[^a-z0-9]+',
            '.',
            'g'
        ),
        72
    ) || '.' || RIGHT(REPLACE(c.id::text, '-', ''), 4),
    COALESCE(NULLIF(c.password_hash, ''), crypt('ChangeMe@123', gen_salt('bf'))),
    c.is_active,
    0,
    now(),
    now()
FROM customers c
LEFT JOIN users u ON u.customer_id = c.id
WHERE u.id IS NULL;

UPDATE users
SET username = 'user.' || RIGHT(REPLACE(id::text, '-', ''), 8)
WHERE username IS NULL OR username = '';
