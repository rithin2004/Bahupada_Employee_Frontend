ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS anniversary DATE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

UPDATE users
SET password_set_at = COALESCE(password_set_at, created_at)
WHERE password_hash IS NOT NULL
  AND password_set_at IS NULL;
