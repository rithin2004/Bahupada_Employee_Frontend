-- Destructive: remove every row from all ordinary/partitioned tables in `public`.
-- Does NOT drop tables, indexes, types, or constraints. Uses TRUNCATE ... RESTART IDENTITY CASCADE.
-- Partition *leaf* tables are omitted (TRUNCATE the parent only).

BEGIN;

DO $$
DECLARE
  _sql text;
BEGIN
  SELECT
    'TRUNCATE TABLE '
    || string_agg(
      format('%I.%I', n.nspname, c.relname),
      ', ' ORDER BY c.relname
    )
    || ' RESTART IDENTITY CASCADE'
  INTO _sql
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND (c.relkind = 'p' OR NOT c.relispartition);

  IF _sql IS NOT NULL THEN
    EXECUTE _sql;
  END IF;
END $$;

-- Restore system admin login (same as 024_reset_client_data_keep_system_auth).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
          AND column_name = 'is_super_admin'
    ) THEN
        EXECUTE $sql$
            INSERT INTO users (
                id,
                account_type,
                username,
                password_hash,
                failed_login_attempts,
                is_super_admin,
                is_active,
                created_at,
                updated_at
            )
            SELECT
                gen_random_uuid(),
                'SYSTEM',
                'admin',
                crypt('ChangeMe@123', gen_salt('bf')),
                0,
                TRUE,
                TRUE,
                now(),
                now()
            WHERE NOT EXISTS (
                SELECT 1
                FROM users
                WHERE account_type = 'SYSTEM'
                   OR username = 'admin'
            )
        $sql$;
    ELSE
        INSERT INTO users (
            id,
            account_type,
            username,
            password_hash,
            failed_login_attempts,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            'SYSTEM',
            'admin',
            crypt('ChangeMe@123', gen_salt('bf')),
            0,
            TRUE,
            now(),
            now()
        WHERE NOT EXISTS (
            SELECT 1
            FROM users
            WHERE account_type = 'SYSTEM'
               OR username = 'admin'
        );
    END IF;
END $$;

COMMIT;
