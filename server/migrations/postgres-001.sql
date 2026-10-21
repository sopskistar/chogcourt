CREATE TABLE IF NOT EXISTS migrations (
  version integer PRIMARY KEY,
  applied_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, username text NOT NULL UNIQUE,
 password_hash text NOT NULL, salt text NOT NULL, created_at text NOT NULL,
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id),
 expires_at text NOT NULL, csrf text NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
 token_key text PRIMARY KEY, chain_id text NOT NULL, collection_address text NOT NULL,
 token_id text NOT NULL, verified_at text NOT NULL, verification_source text NOT NULL,
 current_owner text, UNIQUE(chain_id,collection_address,token_id)
);
CREATE TABLE IF NOT EXISTS claims (
 id text PRIMARY KEY, title text NOT NULL, category text NOT NULL, argument text NOT NULL,
 plaintiff_id text NOT NULL REFERENCES users(id), defendant_id text NOT NULL REFERENCES users(id),
 plaintiff_token_key text REFERENCES tokens(token_key), defendant_token_key text REFERENCES tokens(token_key),
 state text NOT NULL CHECK(state IN ('OPEN','EVIDENCE_RESPONSE','VOTING','FINALIZED')),
 created_at text NOT NULL, response_deadline text NOT NULL, voting_deadline text,
 voting_seconds integer NOT NULL, min_quorum integer NOT NULL, jury_policy text NOT NULL,
 CHECK(plaintiff_id <> defendant_id)
);
CREATE TABLE IF NOT EXISTS evidence (
 id text PRIMARY KEY, claim_id text NOT NULL REFERENCES claims(id),
 author_id text NOT NULL REFERENCES users(id), label text NOT NULL, mime_type text NOT NULL,
 sha256 text NOT NULL, byte_length integer NOT NULL, content bytea NOT NULL, created_at text NOT NULL,
 UNIQUE(claim_id,sha256)
);
CREATE TABLE IF NOT EXISTS responses (
 id text PRIMARY KEY, claim_id text NOT NULL UNIQUE REFERENCES claims(id),
 author_id text NOT NULL REFERENCES users(id), body text NOT NULL, created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS readiness (
 claim_id text NOT NULL REFERENCES claims(id), user_id text NOT NULL REFERENCES users(id),
 created_at text NOT NULL, PRIMARY KEY(claim_id,user_id)
);
CREATE TABLE IF NOT EXISTS votes (
 claim_id text NOT NULL REFERENCES claims(id), user_id text NOT NULL REFERENCES users(id),
 token_key text REFERENCES tokens(token_key),
 choice text NOT NULL CHECK(choice IN ('GUILTY','INNOCENT','NOT_ENOUGH_EVIDENCE')),
 eligibility_basis text NOT NULL, created_at text NOT NULL,
 PRIMARY KEY(claim_id,user_id), UNIQUE(claim_id,token_key)
);
CREATE TABLE IF NOT EXISTS verdicts (
 claim_id text PRIMARY KEY REFERENCES claims(id), outcome text NOT NULL,
 reason text NOT NULL, total integer NOT NULL, guilty integer NOT NULL, innocent integer NOT NULL,
 insufficient integer NOT NULL, min_quorum integer NOT NULL, created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, claim_id text NOT NULL REFERENCES claims(id),
 actor_id text REFERENCES users(id), event text NOT NULL, detail text NOT NULL, created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS nominations (
 id text PRIMARY KEY, claim_id text NOT NULL REFERENCES claims(id), user_id text NOT NULL REFERENCES users(id),
 day text NOT NULL, reason text NOT NULL, verification_source text NOT NULL,
 verified_balance text NOT NULL, created_at text NOT NULL, UNIQUE(user_id,day)
);
CREATE INDEX IF NOT EXISTS claims_created ON claims(created_at DESC);
CREATE INDEX IF NOT EXISTS evidence_claim ON evidence(claim_id);
CREATE INDEX IF NOT EXISTS votes_user ON votes(user_id,created_at);
CREATE INDEX IF NOT EXISTS history_claim ON history(claim_id,id);
INSERT INTO migrations(version,applied_at) VALUES
 (1,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
ON CONFLICT(version) DO NOTHING;
