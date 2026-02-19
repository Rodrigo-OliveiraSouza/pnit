-- Initial schema for GTERF

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub text NOT NULL UNIQUE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'registrar', 'teacher')),
  status text NOT NULL CHECK (status IN ('active', 'disabled', 'pending')),
  full_name text NULL,
  phone text NULL,
  organization text NULL,
  city text NULL,
  state text NULL,
  territory text NULL,
  access_reason text NULL,
  password_hash text NULL,
  password_salt text NULL,
  last_login_at timestamptz NULL,
  approved_by uuid NULL REFERENCES app_users(id),
  approved_at timestamptz NULL,
  link_code_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email ON app_users (email);

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

CREATE INDEX IF NOT EXISTS idx_user_link_codes_created_by ON user_link_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_user_link_codes_status ON user_link_codes (status);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_app_users_link_code'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT fk_app_users_link_code
      FOREIGN KEY (link_code_id)
      REFERENCES user_link_codes(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_link_code_id ON app_users (link_code_id);

CREATE TABLE IF NOT EXISTS employees (
  user_id uuid PRIMARY KEY REFERENCES app_users(id),
  active boolean NOT NULL DEFAULT true,
  department text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  activity text NULL,
  focus_social text NULL,
  notes text NULL,
  families_count integer NULL,
  organization_type text NULL,
  leader_name text NULL,
  leader_contact text NULL,
  activities text NULL,
  meeting_frequency text NULL,
  city text NULL,
  state text NULL,
  created_by uuid NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communities_name ON communities (name);

CREATE TABLE IF NOT EXISTS residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  doc_id text NULL,
  birth_date date NULL,
  sex text NULL,
  phone text NULL,
  email text NULL,
  address text NULL,
  city text NULL,
  state text NULL,
  neighborhood text NULL,
  community_name text NULL,
  household_size integer NULL,
  children_count integer NULL,
  elderly_count integer NULL,
  pcd_count integer NULL,
  notes text NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('approved', 'pending', 'rejected')),
  approved_by uuid NULL REFERENCES app_users(id),
  approved_at timestamptz NULL,
  access_code_id uuid NULL REFERENCES access_codes(id),
  submitted_via_code boolean NOT NULL DEFAULT false,
  public_code text NULL,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS resident_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  health_score integer NOT NULL CHECK (health_score BETWEEN 1 AND 10),
  health_has_clinic boolean NULL,
  health_has_emergency boolean NULL,
  health_has_community_agent boolean NULL,
  health_unit_distance_km numeric(8,2) NULL,
  health_travel_time text NULL,
  health_has_regular_service boolean NULL,
  health_has_ambulance boolean NULL,
  health_difficulties text NULL,
  health_notes text NULL,
  education_score integer NOT NULL CHECK (education_score BETWEEN 1 AND 10),
  education_level text NULL,
  education_has_school boolean NULL,
  education_has_transport boolean NULL,
  education_material_support boolean NULL,
  education_has_internet boolean NULL,
  education_notes text NULL,
  income_score integer NOT NULL CHECK (income_score BETWEEN 1 AND 10),
  income_monthly numeric(12,2) NULL,
  income_source text NULL,
  income_contributors integer NULL,
  income_occupation_type text NULL,
  income_has_social_program boolean NULL,
  income_social_program text NULL,
  assets_has_car boolean NULL,
  assets_has_fridge boolean NULL,
  assets_has_furniture boolean NULL,
  assets_has_land boolean NULL,
  housing_score integer NOT NULL CHECK (housing_score BETWEEN 1 AND 10),
  housing_rooms integer NULL,
  housing_area_m2 numeric(10,2) NULL,
  housing_land_m2 numeric(10,2) NULL,
  housing_type text NULL,
  housing_material text NULL,
  housing_has_bathroom boolean NULL,
  housing_has_water_treated boolean NULL,
  housing_condition text NULL,
  housing_risks text NULL,
  security_score integer NOT NULL CHECK (security_score BETWEEN 1 AND 10),
  security_has_police_station boolean NULL,
  security_has_patrol boolean NULL,
  security_has_guard boolean NULL,
  security_occurrences text NULL,
  security_notes text NULL,
  race_identity text NULL,
  territory_narrative text NULL,
  territory_memories text NULL,
  territory_conflicts text NULL,
  territory_culture text NULL,
  energy_access text NULL,
  water_supply text NULL,
  water_treatment text NULL,
  sewage_type text NULL,
  garbage_collection text NULL,
  internet_access boolean NULL,
  transport_access boolean NULL,
  participation_types text NULL,
  participation_events text NULL,
  participation_engagement text NULL,
  demand_priorities text NULL,
  photo_types text NULL,
  vulnerability_level text NULL,
  technical_issues text NULL,
  referrals text NULL,
  agencies_contacted text NULL,
  consent_accepted boolean NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resident_profiles_resident
  ON resident_profiles (resident_id);

CREATE TABLE IF NOT EXISTS map_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  public_lat double precision NOT NULL,
  public_lng double precision NOT NULL,
  accuracy_m integer NULL,
  precision text NOT NULL CHECK (precision IN ('approx', 'exact')),
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('approved', 'pending', 'rejected')),
  category text NULL,
  public_note text NULL,
  area_type text NULL,
  reference_point text NULL,
  city text NULL,
  state text NULL,
  community_name text NULL,
  source_location text NULL,
  approved_by uuid NULL REFERENCES app_users(id),
  approved_at timestamptz NULL,
  access_code_id uuid NULL REFERENCES access_codes(id),
  submitted_via_code boolean NOT NULL DEFAULT false,
  geog geography(Point, 4326) NOT NULL,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS resident_point_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES residents(id),
  point_id uuid NOT NULL REFERENCES map_points(id),
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NULL REFERENCES residents(id),
  point_id uuid NULL REFERENCES map_points(id),
  s3_key text NOT NULL,
  original_name text NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private', 'public')),
  collection text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text NULL,
  body text NOT NULL,
  support_subtitle text NULL,
  support_text text NULL,
  support_image_description text NULL,
  support_image_source text NULL,
  cover_attachment_id uuid NOT NULL REFERENCES attachments(id),
  support_attachment_id uuid NULL REFERENCES attachments(id),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS complaint_sensitive (
  complaint_id uuid PRIMARY KEY REFERENCES complaints(id) ON DELETE CASCADE,
  ip_address text NULL,
  user_agent text NULL,
  payload_ciphertext text NULL,
  payload_iv text NULL,
  payload_salt text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS complaint_id uuid REFERENCES complaints(id);

CREATE INDEX IF NOT EXISTS idx_attachments_collection ON attachments (collection);
CREATE INDEX IF NOT EXISTS idx_news_posts_created_at ON news_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_posts_created_by ON news_posts (created_by);

CREATE INDEX IF NOT EXISTS idx_map_points_geog ON map_points USING GIST (geog);
CREATE INDEX IF NOT EXISTS idx_map_points_status ON map_points (status);
CREATE INDEX IF NOT EXISTS idx_map_points_updated_at ON map_points (updated_at);
CREATE INDEX IF NOT EXISTS idx_map_points_deleted_at ON map_points (deleted_at);
CREATE INDEX IF NOT EXISTS idx_map_points_approval_status ON map_points (approval_status);

CREATE INDEX IF NOT EXISTS idx_residents_status ON residents (status);
CREATE INDEX IF NOT EXISTS idx_residents_updated_at ON residents (updated_at);
CREATE INDEX IF NOT EXISTS idx_residents_deleted_at ON residents (deleted_at);
CREATE INDEX IF NOT EXISTS idx_residents_approval_status ON residents (approval_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active_resident
  ON resident_point_assignments (resident_id)
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active_point
  ON resident_point_assignments (point_id)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public_map_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id uuid NOT NULL REFERENCES map_points(id),
  public_lat double precision NOT NULL,
  public_lng double precision NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  precision text NOT NULL CHECK (precision IN ('approx', 'exact')),
  region text NULL,
  city text NULL,
  state text NULL,
  community_name text NULL,
  residents integer NOT NULL DEFAULT 0,
  public_note text NULL,
  photo_attachment_id uuid NULL REFERENCES attachments(id),
  snapshot_date date NOT NULL,
  geog geography(Point, 4326) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_public_map_cache_point_snapshot
  ON public_map_cache (point_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_public_map_cache_geog ON public_map_cache USING GIST (geog);
CREATE INDEX IF NOT EXISTS idx_public_map_cache_snapshot ON public_map_cache (snapshot_date);

CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_city ON complaints (city);
CREATE INDEX IF NOT EXISTS idx_complaints_state ON complaints (state);

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid NULL REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geocode_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_query text NOT NULL,
  normalized_query text NOT NULL UNIQUE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  formatted_address text NULL,
  provider text NOT NULL DEFAULT 'google',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_updated_at ON geocode_cache (updated_at);
