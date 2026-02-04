ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS community_name text;

ALTER TABLE map_points
  ADD COLUMN IF NOT EXISTS community_name text;

ALTER TABLE public_map_cache
  ADD COLUMN IF NOT EXISTS community_name text;
