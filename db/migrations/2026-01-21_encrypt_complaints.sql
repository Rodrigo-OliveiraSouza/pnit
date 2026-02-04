ALTER TABLE complaint_sensitive
  ADD COLUMN IF NOT EXISTS payload_ciphertext text;

ALTER TABLE complaint_sensitive
  ADD COLUMN IF NOT EXISTS payload_iv text;

ALTER TABLE complaint_sensitive
  ADD COLUMN IF NOT EXISTS payload_salt text;
