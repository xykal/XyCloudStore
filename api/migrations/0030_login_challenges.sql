-- Login baru via tautan email + IP terakhir perangkat (Discord-style).
ALTER TABLE security_devices ADD COLUMN last_ip TEXT;

CREATE TABLE IF NOT EXISTS login_challenges (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT,
  token_hash TEXT NOT NULL UNIQUE, ip TEXT, model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL, used_at TEXT);
CREATE INDEX IF NOT EXISTS idx_login_challenges_user ON login_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_login_challenges_exp ON login_challenges(expires_at);
