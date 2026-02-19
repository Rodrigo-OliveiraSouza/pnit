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

CREATE INDEX IF NOT EXISTS idx_news_posts_created_at ON news_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_posts_created_by ON news_posts (created_by);
