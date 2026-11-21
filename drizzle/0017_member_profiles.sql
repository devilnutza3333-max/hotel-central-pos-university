-- Additive; never modify users, orders, payment, or staff duty data.
CREATE TABLE IF NOT EXISTS member_profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  avatar_data TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
