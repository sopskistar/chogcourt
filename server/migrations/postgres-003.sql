CREATE TABLE IF NOT EXISTS wallet_sessions (
 session_hash text PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
 generation text NOT NULL, address text NOT NULL, token_id text,
 authenticated_at text, expires_at text, observation_json text
);
CREATE TABLE IF NOT EXISTS wallet_challenges (
 session_hash text PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
 nonce text NOT NULL UNIQUE, message text NOT NULL, expires_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
 rate_key text PRIMARY KEY, window_start integer NOT NULL, hits integer NOT NULL
);
INSERT INTO migrations(version,applied_at) VALUES
 (3,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
ON CONFLICT(version) DO NOTHING;
