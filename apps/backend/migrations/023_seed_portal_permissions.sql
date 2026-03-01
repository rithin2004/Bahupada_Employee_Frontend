CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_module_name text;
    v_action_name text;
BEGIN
    FOREACH v_module_name IN ARRAY ARRAY['sales', 'planning', 'packing', 'delivery', 'schemes', 'salesman']
    LOOP
        FOREACH v_action_name IN ARRAY ARRAY['create', 'read', 'update', 'delete']
        LOOP
            INSERT INTO permissions (id, module_name, action_name, description)
            SELECT
                gen_random_uuid(),
                v_module_name,
                v_action_name,
                initcap(v_module_name) || ' ' || v_action_name || ' permission'
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
WHERE r.is_active = TRUE
  AND p.module_name IN ('sales', 'planning', 'packing', 'delivery', 'schemes', 'salesman')
  AND NOT EXISTS (
      SELECT 1
      FROM role_permissions rp
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
  );
