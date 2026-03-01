-- Identity and portal hardening
-- 1) Add account classification for users
-- 2) Add portal scope classification for roles
-- 3) Backfill role rows and employees.role_id mapping
-- 4) Enforce stronger integrity for employee<->role mapping

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
        CREATE TYPE account_type AS ENUM ('EMPLOYEE', 'SYSTEM', 'CUSTOMER');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portal_scope') THEN
        CREATE TYPE portal_scope AS ENUM ('ADMIN', 'EMPLOYEE', 'BOTH');
    END IF;
END $$;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_type account_type NOT NULL DEFAULT 'EMPLOYEE';

ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS portal_scope portal_scope NOT NULL DEFAULT 'EMPLOYEE';

-- Seed canonical role rows for employee-role enum values.
INSERT INTO roles (id, role_name, portal_scope, description, is_active, created_at, updated_at)
VALUES
    (gen_random_uuid(), 'ADMIN', 'ADMIN', 'System administrator', TRUE, now(), now()),
    (gen_random_uuid(), 'PACKER', 'EMPLOYEE', 'Packing operations', TRUE, now(), now()),
    (gen_random_uuid(), 'SUPERVISOR', 'EMPLOYEE', 'Floor supervisor', TRUE, now(), now()),
    (gen_random_uuid(), 'SALESMAN', 'EMPLOYEE', 'Salesman operations', TRUE, now(), now()),
    (gen_random_uuid(), 'DRIVER', 'EMPLOYEE', 'Delivery driver', TRUE, now(), now()),
    (gen_random_uuid(), 'IN_VEHICLE_HELPER', 'EMPLOYEE', 'In-vehicle helper', TRUE, now(), now()),
    (gen_random_uuid(), 'BILL_MANAGER', 'EMPLOYEE', 'Bill manager', TRUE, now(), now()),
    (gen_random_uuid(), 'LOADER', 'EMPLOYEE', 'Loading operations', TRUE, now(), now())
ON CONFLICT (role_name) DO NOTHING;

UPDATE roles
SET portal_scope = CASE
    WHEN role_name = 'ADMIN' THEN 'ADMIN'::portal_scope
    ELSE 'EMPLOYEE'::portal_scope
END;

-- System/service users are not mapped to employees.
UPDATE users
SET account_type = 'SYSTEM'::account_type
WHERE employee_id IS NULL;

UPDATE users
SET account_type = 'EMPLOYEE'::account_type
WHERE employee_id IS NOT NULL;

-- Backfill employees.role_id using canonical role_name match.
UPDATE employees e
SET role_id = r.id
FROM roles r
WHERE r.role_name = e.role::text
  AND e.role_id IS NULL;

-- Enforce one employee login account when account_type is EMPLOYEE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_id_employee_account
    ON users(employee_id)
    WHERE employee_id IS NOT NULL AND account_type = 'EMPLOYEE'::account_type;
