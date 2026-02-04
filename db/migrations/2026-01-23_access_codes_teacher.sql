-- Add teacher role, access codes, and approval workflow for guest submissions

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'employee', 'user', 'teacher'));

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE TABLE IF NOT EXISTS access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  used_at timestamptz NULL,
  used_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_access_codes_created_by ON access_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_access_codes_status ON access_codes (status);

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('approved', 'pending', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_code_id uuid REFERENCES access_codes(id),
  ADD COLUMN IF NOT EXISTS submitted_via_code boolean NOT NULL DEFAULT false;

ALTER TABLE map_points
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('approved', 'pending', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_code_id uuid REFERENCES access_codes(id),
  ADD COLUMN IF NOT EXISTS submitted_via_code boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_residents_approval_status ON residents (approval_status);
CREATE INDEX IF NOT EXISTS idx_map_points_approval_status ON map_points (approval_status);
