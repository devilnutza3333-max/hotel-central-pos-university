import { env } from "cloudflare:workers";

/** First-use additive installation. Never alters sales or existing accounts. */
export async function ensureMemberProfileStorage() {
  const db=env.DB;
  if(!db) throw new Error("POS_D1_UNAVAILABLE");
  const table=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='member_profiles'").first<{name:string}>();
  if(table) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS member_profiles (
    user_id TEXT PRIMARY KEY NOT NULL,
    avatar_data TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  )`).run();
}
