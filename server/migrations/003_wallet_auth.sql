-- Additive session authentication only; court and Daily Docket tables/rules are unchanged.
CREATE TABLE wallet_sessions (
 session_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
 generation TEXT NOT NULL,
 address TEXT NOT NULL,
 token_id TEXT,
 authenticated_at TEXT,
 expires_at TEXT,
 observation_json TEXT
);
CREATE TABLE wallet_challenges (
 session_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
 nonce TEXT NOT NULL UNIQUE,
 message TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
INSERT INTO migrations(version,applied_at) VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
