-- Additive only: existing claims, court rules, votes and verdicts are unchanged.
CREATE TABLE daily_trials (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 author_id TEXT NOT NULL REFERENCES users(id),
 question TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','VOTING','CLOSED')),
 created_at TEXT NOT NULL,
 slot TEXT UNIQUE,
 opened_at TEXT,
 closes_at TEXT,
 min_quorum INTEGER NOT NULL DEFAULT 3 CHECK(min_quorum=3)
);
CREATE UNIQUE INDEX daily_one_queued_per_author ON daily_trials(author_id) WHERE state='QUEUED';
CREATE UNIQUE INDEX daily_one_active ON daily_trials(state) WHERE state='VOTING';
CREATE TABLE daily_choices (
 trial_id TEXT NOT NULL REFERENCES daily_trials(id),
 position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 3),
 label TEXT NOT NULL,
 PRIMARY KEY(trial_id,position)
);
CREATE TABLE daily_votes (
 trial_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 choice INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(trial_id,user_id),
 FOREIGN KEY(trial_id,choice) REFERENCES daily_choices(trial_id,position)
);
CREATE TABLE daily_results (
 trial_id TEXT PRIMARY KEY REFERENCES daily_trials(id),
 reason TEXT NOT NULL CHECK(reason IN ('WINNER','TIE','INSUFFICIENT_PARTICIPATION')),
 total INTEGER NOT NULL,
 counts_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX daily_votes_user ON daily_votes(user_id,created_at);
INSERT INTO migrations(version,applied_at) VALUES(2,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
