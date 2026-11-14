CREATE TABLE IF NOT EXISTS match_calendar (
  slug TEXT PRIMARY KEY,
  kickoff INTEGER NOT NULL,
  status TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  finished_at INTEGER,
  retire_at INTEGER,
  indexable INTEGER NOT NULL DEFAULT 0 CHECK (indexable IN (0, 1)),
  payload TEXT,
  reading TEXT,
  CHECK (payload IS NULL OR json_valid(payload)),
  CHECK (reading IS NULL OR json_valid(reading))
);
CREATE INDEX IF NOT EXISTS match_calendar_kickoff ON match_calendar(kickoff);
CREATE INDEX IF NOT EXISTS match_calendar_expiry ON match_calendar(retire_at) WHERE retire_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS match_calendar_alias (
  alias TEXT PRIMARY KEY,
  slug TEXT NOT NULL REFERENCES match_calendar(slug) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS match_calendar_alias_slug ON match_calendar_alias(slug);

CREATE TABLE IF NOT EXISTS match_calendar_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  feed_at INTEGER NOT NULL,
  shadow_started_at INTEGER NOT NULL,
  activated_at INTEGER,
  rollout_check_at INTEGER NOT NULL,
  healthy INTEGER NOT NULL CHECK (healthy IN (0, 1))
);
