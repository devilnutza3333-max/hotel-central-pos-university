-- Isolated additive registration metadata; approval is mandatory for every new account.
CREATE TABLE IF NOT EXISTS registration_requests (
  user_id TEXT PRIMARY KEY NOT NULL,
  member_type TEXT NOT NULL CHECK(member_type IN ('teacher','student')),
  school_id TEXT NOT NULL,
  program TEXT NOT NULL,
  year_level TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS registration_requests_status_created_idx ON registration_requests(status,created_at);
