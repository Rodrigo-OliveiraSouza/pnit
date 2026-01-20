ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_salt text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email ON app_users (email);

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE map_points
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS source_location text;

ALTER TABLE public_map_cache
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS photo_attachment_id uuid REFERENCES attachments(id);

CREATE TABLE IF NOT EXISTS resident_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  health_score integer NOT NULL CHECK (health_score BETWEEN 1 AND 10),
  health_has_clinic boolean NULL,
  health_has_emergency boolean NULL,
  health_has_community_agent boolean NULL,
  health_notes text NULL,
  education_score integer NOT NULL CHECK (education_score BETWEEN 1 AND 10),
  education_level text NULL,
  education_has_school boolean NULL,
  education_has_transport boolean NULL,
  education_material_support boolean NULL,
  education_notes text NULL,
  income_score integer NOT NULL CHECK (income_score BETWEEN 1 AND 10),
  income_monthly numeric(12,2) NULL,
  income_source text NULL,
  assets_has_car boolean NULL,
  assets_has_fridge boolean NULL,
  assets_has_furniture boolean NULL,
  assets_has_land boolean NULL,
  housing_score integer NOT NULL CHECK (housing_score BETWEEN 1 AND 10),
  housing_rooms integer NULL,
  housing_area_m2 numeric(10,2) NULL,
  housing_land_m2 numeric(10,2) NULL,
  housing_type text NULL,
  security_score integer NOT NULL CHECK (security_score BETWEEN 1 AND 10),
  security_has_police_station boolean NULL,
  security_has_patrol boolean NULL,
  security_notes text NULL,
  race_identity text NULL,
  territory_narrative text NULL,
  territory_memories text NULL,
  territory_conflicts text NULL,
  territory_culture text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resident_profiles_resident
  ON resident_profiles (resident_id);
