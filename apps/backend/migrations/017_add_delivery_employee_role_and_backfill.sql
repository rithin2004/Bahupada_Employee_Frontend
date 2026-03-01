-- Introduce DELIVERY_EMPLOYEE as base workforce role and backfill seeded staff.
-- Sub-roles for dispatch (DRIVER / IN_VEHICLE_HELPER / BILL_MANAGER / LOADER)
-- remain assignment-level roles.

DO $$
BEGIN
    ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'DELIVERY_EMPLOYEE';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- Ensure role master contains DELIVERY_EMPLOYEE for admin mapping.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO roles (id, role_name, portal_scope, description, is_active, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'DELIVERY_EMPLOYEE',
    'EMPLOYEE',
    'Base delivery workforce role; trip sub-role is assigned operationally.',
    TRUE,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE role_name = 'DELIVERY_EMPLOYEE'
);

UPDATE employees
SET role = 'DELIVERY_EMPLOYEE'
WHERE lower(full_name) IN ('shahul', 'narayana', 'prasad', 'vijay', 'altaf')
  AND role = 'DRIVER';
