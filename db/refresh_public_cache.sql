-- Refresh daily public map cache (run once per day via scheduled Lambda)
BEGIN;

DELETE FROM public_map_cache
WHERE snapshot_date = CURRENT_DATE;

WITH active_assignments AS (
  SELECT point_id, COUNT(*) AS residents
  FROM resident_point_assignments
  WHERE active = true
  GROUP BY point_id
)
INSERT INTO public_map_cache (
  point_id,
  public_lat,
  public_lng,
  status,
  precision,
  region,
  residents,
  public_note,
  snapshot_date,
  geog,
  updated_at
)
SELECT
  mp.id,
  mp.public_lat,
  mp.public_lng,
  mp.status,
  mp.precision,
  NULL,
  COALESCE(a.residents, 0),
  mp.public_note,
  CURRENT_DATE,
  ST_SetSRID(ST_MakePoint(mp.public_lng, mp.public_lat), 4326)::geography,
  now()
FROM map_points mp
LEFT JOIN active_assignments a ON a.point_id = mp.id
WHERE mp.deleted_at IS NULL;

COMMIT;
