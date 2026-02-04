ALTER TABLE theme_palettes
  ADD COLUMN IF NOT EXISTS typography jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE theme_palettes
SET typography = (
  SELECT '{"body":"\"Source Sans 3\", \"Segoe UI\", sans-serif","heading":"\"Newsreader\", serif","button":"\"Source Sans 3\", \"Segoe UI\", sans-serif"}'::jsonb
)
WHERE typography IS NULL OR typography = '{}'::jsonb;
