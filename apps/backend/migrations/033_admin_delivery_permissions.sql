CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_action_name text;
BEGIN
    FOREACH v_action_name IN ARRAY ARRAY['create', 'read', 'update', 'delete']
    LOOP
        INSERT INTO permissions (id, module_name, action_name, description)
        SELECT
            gen_random_uuid(),
            'delivery',
            v_action_name,
            'Delivery ' || v_action_name || ' permission'
        WHERE NOT EXISTS (
            SELECT 1
            FROM permissions
            WHERE permissions.module_name = 'delivery'
              AND permissions.action_name = v_action_name
        );
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
JOIN permissions p
  ON p.module_name = 'delivery'
WHERE r.role_name IN ('SUPER_ADMIN', 'ADMIN')
  AND r.portal_scope = 'ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permissions rp
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
  );
