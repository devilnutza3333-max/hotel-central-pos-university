import { env } from "cloudflare:workers";

/** Safe additive migration; no POS order or existing account data is changed. */
export async function ensureRegistrationStorage(): Promise<void> {
  const db = env.DB;
  if (!db) throw new Error("POS_D1_UNAVAILABLE");
  const found = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registration_requests'").first<{ name: string }>();
  if (found) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS registration_requests (
      user_id TEXT PRIMARY KEY NOT NULL,
      member_type TEXT NOT NULL CHECK(member_type IN ('teacher','student')),
      school_id TEXT NOT NULL DEFAULT '',
      program TEXT NOT NULL DEFAULT '',
      year_level TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS registration_requests_status_created_idx ON registration_requests(status,created_at)"),
    db.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0016_member_registration.sql')"),
  ]);
}
