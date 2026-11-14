CREATE TABLE IF NOT EXISTS editorials (
  slug TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  retired_at TEXT,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE INDEX IF NOT EXISTS editorials_listing ON editorials (position, slug) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS editorials_review_queue ON editorials (checked_at, position, slug) WHERE retired_at IS NULL;
CREATE TRIGGER IF NOT EXISTS editorials_capacity
BEFORE INSERT ON editorials
WHEN NEW.retired_at IS NULL AND NOT EXISTS (SELECT 1 FROM editorials WHERE slug = NEW.slug)
  AND (SELECT count(*) FROM editorials WHERE retired_at IS NULL) >= 20
BEGIN
  SELECT RAISE(ABORT, 'Editorial catalog is full');
END;
