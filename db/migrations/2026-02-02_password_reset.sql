CREATE TABLE IF NOT EXISTS password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  requested_ip text NULL,
  requested_user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user
  ON password_reset_codes (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_active
  ON password_reset_codes (user_id, expires_at)
  WHERE used_at IS NULL;
