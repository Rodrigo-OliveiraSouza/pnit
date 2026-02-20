ALTER TABLE news_posts
  ADD COLUMN IF NOT EXISTS territory text NULL;

CREATE INDEX IF NOT EXISTS idx_news_posts_territory ON news_posts (territory);
