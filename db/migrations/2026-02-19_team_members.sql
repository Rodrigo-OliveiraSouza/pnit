CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occupation text NOT NULL,
  name text NOT NULL,
  resume text NULL,
  position integer NOT NULL CHECK (position > 0),
  photo_attachment_id uuid NULL REFERENCES attachments(id),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_position ON team_members (position ASC);
CREATE INDEX IF NOT EXISTS idx_team_members_created_by ON team_members (created_by);
