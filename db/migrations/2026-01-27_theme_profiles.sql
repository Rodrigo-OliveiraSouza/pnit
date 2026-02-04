CREATE TABLE IF NOT EXISTS theme_palettes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  colors jsonb NOT NULL,
  image_styles jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theme_palettes_name ON theme_palettes (name);

CREATE TABLE IF NOT EXISTS theme_active (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  theme_id uuid NULL REFERENCES theme_palettes(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO theme_palettes (name, colors, image_styles)
SELECT
  'Tema padrao',
  '{"primary":"#c8651e","secondary":"#b85a16","accent":"#f0a23a","background":"#f4f4f4","text":"#2b1a12","border":"#d6d6d6","header_start":"#1f2a4a","header_end":"#2b3a66"}'::jsonb,
  '{"overlay":"#000000","overlay_opacity":0,"saturation":1,"contrast":1,"brightness":1,"radius":24,"shadow":"0 18px 40px rgba(43,26,18,0.14)"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM theme_palettes);

INSERT INTO theme_active (id, theme_id, updated_at)
SELECT true, id, now()
FROM theme_palettes
WHERE name = 'Tema padrao'
  AND NOT EXISTS (SELECT 1 FROM theme_active);

UPDATE theme_active
SET theme_id = (
  SELECT id FROM theme_palettes ORDER BY created_at ASC LIMIT 1
),
updated_at = now()
WHERE theme_id IS NULL;
