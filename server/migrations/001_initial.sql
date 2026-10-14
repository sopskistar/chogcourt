CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 expires_at TEXT NOT NULL, csrf TEXT NOT NULL
);
CREATE TABLE tokens (
 token_key TEXT PRIMARY KEY, chain_id TEXT NOT NULL, collection_address TEXT NOT NULL,
 token_id TEXT NOT NULL, verified_at TEXT NOT NULL, verification_source TEXT NOT NULL,
 current_owner TEXT, UNIQUE(chain_id,collection_address,token_id)
);
CREATE TABLE claims (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, argument TEXT NOT NULL,
 plaintiff_id TEXT NOT NULL REFERENCES users(id), defendant_id TEXT NOT NULL REFERENCES users(id),
 plaintiff_token_key TEXT REFERENCES tokens(token_key), defendant_token_key TEXT REFERENCES tokens(token_key),
 state TEXT NOT NULL CHECK(state IN ('OPEN','EVIDENCE_RESPONSE','VOTING','FINALIZED')),
 created_at TEXT NOT NULL, response_deadline TEXT NOT NULL, voting_deadline TEXT,
 voting_seconds INTEGER NOT NULL, min_quorum INTEGER NOT NULL, jury_policy TEXT NOT NULL,
 CHECK(plaintiff_id <> defendant_id)
);
CREATE TABLE evidence (
 id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id),
 author_id TEXT NOT NULL REFERENCES users(id), label TEXT NOT NULL, mime_type TEXT NOT NULL,
 sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(claim_id,sha256)
);
CREATE TABLE responses (
 id TEXT PRIMARY KEY, claim_id TEXT NOT NULL UNIQUE REFERENCES claims(id),
 author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE readiness (
 claim_id TEXT NOT NULL REFERENCES claims(id), user_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, PRIMARY KEY(claim_id,user_id)
);
CREATE TABLE votes (
 claim_id TEXT NOT NULL REFERENCES claims(id), user_id TEXT NOT NULL REFERENCES users(id),
 token_key TEXT REFERENCES tokens(token_key),
 choice TEXT NOT NULL CHECK(choice IN ('GUILTY','INNOCENT','NOT_ENOUGH_EVIDENCE')),
 eligibility_basis TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(claim_id,user_id), UNIQUE(claim_id,token_key)
);
CREATE TABLE verdicts (
 claim_id TEXT PRIMARY KEY REFERENCES claims(id), outcome TEXT NOT NULL,
 reason TEXT NOT NULL, total INTEGER NOT NULL, guilty INTEGER NOT NULL, innocent INTEGER NOT NULL,
 insufficient INTEGER NOT NULL, min_quorum INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id TEXT NOT NULL REFERENCES claims(id),
 actor_id TEXT REFERENCES users(id), event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE nominations (
 id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), user_id TEXT NOT NULL REFERENCES users(id),
 day TEXT NOT NULL, reason TEXT NOT NULL, verification_source TEXT NOT NULL,
 verified_balance TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,day)
);
CREATE INDEX claims_created ON claims(created_at DESC);
CREATE INDEX evidence_claim ON evidence(claim_id);
CREATE INDEX votes_user ON votes(user_id,created_at);
CREATE INDEX history_claim ON history(claim_id,id);
INSERT INTO migrations(version,applied_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
