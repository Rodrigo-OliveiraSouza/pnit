em -- Update role hierarchy and add binding codes for user approval routing

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

-- Normalize old roles to the new "registrar" role
UPDATE app_users
SET role = 'registrar'
WHERE role IN ('employee', 'user');

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'manager', 'registrar', 'teacher'));

CREATE TABLE IF NOT EXISTS user_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  used_by uuid NULL REFERENCES app_users(id),
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_user_link_codes_created_by
  ON user_link_codes (created_by);

CREATE INDEX IF NOT EXISTS idx_user_link_codes_status
  ON user_link_codes (status);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS link_code_id uuid NULL REFERENCES user_link_codes(id);

CREATE INDEX IF NOT EXISTS idx_app_users_link_code_id
  ON app_users (link_code_id);

