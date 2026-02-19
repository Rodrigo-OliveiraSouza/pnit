CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid NULL REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
