-- Initial schema for GTERF

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub text NOT NULL UNIQUE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'employee', 'user')),
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  user_id uuid PRIMARY KEY REFERENCES app_users(id),
  active boolean NOT NULL DEFAULT true,
  department text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  doc_id text NULL,
  phone text NULL,
  email text NULL,
  address text NULL,
  notes text NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  public_code text NULL,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS map_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  public_lat double precision NOT NULL,
  public_lng double precision NOT NULL,
  accuracy_m integer NULL,
  precision text NOT NULL CHECK (precision IN ('approx', 'exact')),
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  category text NULL,
  public_note text NULL,
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
  mime_type text NOT NULL,
  size integer NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private', 'public')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_points_geog ON map_points USING GIST (geog);
CREATE INDEX IF NOT EXISTS idx_map_points_status ON map_points (status);
CREATE INDEX IF NOT EXISTS idx_map_points_updated_at ON map_points (updated_at);
CREATE INDEX IF NOT EXISTS idx_map_points_deleted_at ON map_points (deleted_at);

CREATE INDEX IF NOT EXISTS idx_residents_status ON residents (status);
CREATE INDEX IF NOT EXISTS idx_residents_updated_at ON residents (updated_at);
CREATE INDEX IF NOT EXISTS idx_residents_deleted_at ON residents (deleted_at);

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
  residents integer NOT NULL DEFAULT 0,
  public_note text NULL,
  snapshot_date date NOT NULL,
  geog geography(Point, 4326) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_public_map_cache_point_snapshot
  ON public_map_cache (point_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_public_map_cache_geog ON public_map_cache USING GIST (geog);
CREATE INDEX IF NOT EXISTS idx_public_map_cache_snapshot ON public_map_cache (snapshot_date);

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
