-- Refresh daily public map cache (run once per day via scheduled Lambda)
BEGIN;

DELETE FROM public_map_cache
WHERE snapshot_date = CURRENT_DATE;

WITH active_assignments AS (
  SELECT point_id, COUNT(*) AS residents
  FROM resident_point_assignments
  WHERE active = true
  GROUP BY point_id
),
latest_photo AS (
  SELECT DISTINCT ON (point_id)
    id,
    point_id
  FROM attachments
  WHERE visibility = 'public' AND point_id IS NOT NULL
  ORDER BY point_id, created_at DESC
)
INSERT INTO public_map_cache (
  point_id,
  public_lat,
  public_lng,
  status,
  precision,
  region,
  city,
  state,
  residents,
  public_note,
  photo_attachment_id,
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
  mp.city,
  mp.state,
  COALESCE(a.residents, 0),
  mp.public_note,
  lp.id,
  CURRENT_DATE,
  ST_SetSRID(ST_MakePoint(mp.public_lng, mp.public_lat), 4326)::geography,
  now()
FROM map_points mp
LEFT JOIN active_assignments a ON a.point_id = mp.id
LEFT JOIN latest_photo lp ON lp.point_id = mp.id
WHERE mp.deleted_at IS NULL;

COMMIT;
