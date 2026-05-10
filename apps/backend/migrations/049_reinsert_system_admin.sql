-- Idempotent: ensure SYSTEM admin exists (username admin / password ChangeMe@123).
-- Use if you already ran an older 048 without the admin block, or to repair login.

BEGIN;

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
