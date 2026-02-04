ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS original_name text;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS collection text;

CREATE INDEX IF NOT EXISTS idx_attachments_collection ON attachments (collection);
