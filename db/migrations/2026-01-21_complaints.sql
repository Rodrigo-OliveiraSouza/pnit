CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  description text NOT NULL,
  location_text text NULL,
  lat double precision NULL,
  lng double precision NULL,
  city text NULL,
  state text NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'closed')),
  photo_attachment_id uuid NULL REFERENCES attachments(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS complaint_id uuid REFERENCES complaints(id);

CREATE TABLE IF NOT EXISTS complaint_sensitive (
  complaint_id uuid PRIMARY KEY REFERENCES complaints(id) ON DELETE CASCADE,
  ip_address text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_city ON complaints (city);
CREATE INDEX IF NOT EXISTS idx_complaints_state ON complaints (state);
