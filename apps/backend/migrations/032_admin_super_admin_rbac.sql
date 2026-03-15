CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT FALSE;

UPDATE users
SET is_super_admin = TRUE
WHERE username = 'admin'
   OR email = 'admin@bahu.local';

INSERT INTO roles (id, role_name, portal_scope, description, is_active, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'SUPER_ADMIN',
    'ADMIN',
    'Super administrator with unrestricted admin portal access',
    TRUE,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE role_name = 'SUPER_ADMIN'
);

INSERT INTO roles (id, role_name, portal_scope, description, is_active, created_at, updated_at)
SELECT
    gen_random_uuid(),
    'ADMIN',
    'ADMIN',
    'Administrator with configurable module permissions',
    TRUE,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE role_name = 'ADMIN' AND portal_scope = 'ADMIN'
);

DO $$
DECLARE
    v_module_name text;
    v_action_name text;
BEGIN
    FOREACH v_module_name IN ARRAY ARRAY[
        'dashboard',
        'purchase',
        'stock',
        'products',
        'warehouses',
        'sales',
        'sales-invoices',
        'planning',
        'areas',
        'routes',
        'vehicles',
        'schemes',
        'price',
        'credit-debit-notes',
        'customers',
        'employees',
        'vendors',
        'admin-access'
    ]
    LOOP
        FOREACH v_action_name IN ARRAY ARRAY['create', 'read', 'update', 'delete']
        LOOP
            INSERT INTO permissions (id, module_name, action_name, description)
            SELECT
                gen_random_uuid(),
                v_module_name,
                v_action_name,
                initcap(replace(v_module_name, '-', ' ')) || ' ' || v_action_name || ' permission'
            WHERE NOT EXISTS (
                SELECT 1
                FROM permissions
                WHERE permissions.module_name = v_module_name
                  AND permissions.action_name = v_action_name
            );
        END LOOP;
    END LOOP;
END $$;

INSERT INTO role_permissions (
    id,
    role_id,
    permission_id,
    can_create,
    can_read,
    can_update,
    can_delete
)
SELECT
    gen_random_uuid(),
    r.id,
    p.id,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name IN ('SUPER_ADMIN', 'ADMIN')
  AND r.portal_scope = 'ADMIN'
  AND p.module_name IN (
      'dashboard',
      'purchase',
      'stock',
      'products',
      'warehouses',
      'sales',
      'sales-invoices',
      'planning',
      'areas',
      'routes',
      'vehicles',
      'schemes',
      'price',
      'credit-debit-notes',
      'customers',
      'employees',
      'vendors',
      'admin-access'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM role_permissions rp
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
  );
