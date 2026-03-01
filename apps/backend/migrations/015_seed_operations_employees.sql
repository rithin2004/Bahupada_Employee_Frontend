-- Seed baseline operations employees.
-- Notes:
-- 1) `phone` is required+unique in `employees`, so placeholder numbers are used.
-- 2) Admin can edit optional fields later from frontend.
-- 3) Delivery team is seeded with base role `DRIVER`; monthly sub-role assignment
--    (Driver/In-Vehicle/Bill Manager/Loader) can be managed operationally.

DO $$
DECLARE
    v_warehouse_id uuid;
BEGIN
    -- Prefer known warehouse name; fallback to first warehouse.
    SELECT w.id
    INTO v_warehouse_id
    FROM warehouses w
    WHERE lower(w.name) = lower('Andhra Central Warehouse')
    ORDER BY w.created_at ASC NULLS LAST, w.id ASC
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
        SELECT w.id
        INTO v_warehouse_id
        FROM warehouses w
        ORDER BY w.created_at ASC NULLS LAST, w.id ASC
        LIMIT 1;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Cannot seed employees: no warehouse found.';
    END IF;

    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    INSERT INTO employees (
        id,
        warehouse_id,
        full_name,
        name,
        role,
        gender,
        phone,
        is_active
    )
    SELECT
        gen_random_uuid(),
        v_warehouse_id,
        s.full_name,
        s.full_name,
        s.role::employee_role,
        s.gender::gender,
        s.phone,
        TRUE
    FROM (
        VALUES
            -- Sales employees
            ('Hari', 'SALESMAN', NULL, '9000001001'),
            ('Prakash', 'SALESMAN', NULL, '9000001002'),
            ('Vinod', 'SALESMAN', NULL, '9000001003'),
            ('Muneer', 'SALESMAN', NULL, '9000001004'),

            -- Delivery employees (base role, sub-role assigned monthly)
            ('Shahul', 'DRIVER', NULL, '9000001101'),
            ('Narayana', 'DRIVER', NULL, '9000001102'),
            ('Prasad', 'DRIVER', NULL, '9000001103'),
            ('Vijay', 'DRIVER', NULL, '9000001104'),
            ('Altaf', 'DRIVER', NULL, '9000001105'),

            -- Packers (female)
            ('Krishna Veni', 'PACKER', 'FEMALE', '9000001201'),
            ('Rama Devi', 'PACKER', 'FEMALE', '9000001202'),

            -- Supervisor
            ('Rabbani', 'SUPERVISOR', NULL, '9000001301')
    ) AS s(full_name, role, gender, phone)
    WHERE NOT EXISTS (
        SELECT 1
        FROM employees e
        WHERE lower(e.full_name) = lower(s.full_name)
    );
END $$;
