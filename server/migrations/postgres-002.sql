CREATE TABLE IF NOT EXISTS daily_trials (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id text NOT NULL UNIQUE, author_id text NOT NULL REFERENCES users(id), question text NOT NULL,
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','VOTING','CLOSED')),
 created_at text NOT NULL, slot text UNIQUE, opened_at text, closes_at text,
 min_quorum integer NOT NULL DEFAULT 3 CHECK(min_quorum=3)
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_one_queued_per_author ON daily_trials(author_id) WHERE state='QUEUED';
CREATE UNIQUE INDEX IF NOT EXISTS daily_one_active ON daily_trials(state) WHERE state='VOTING';
CREATE TABLE IF NOT EXISTS daily_choices (
 trial_id text NOT NULL REFERENCES daily_trials(id), position integer NOT NULL CHECK(position BETWEEN 0 AND 3),
 label text NOT NULL, PRIMARY KEY(trial_id,position)
);
CREATE TABLE IF NOT EXISTS daily_votes (
 trial_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), choice integer NOT NULL,
 created_at text NOT NULL, PRIMARY KEY(trial_id,user_id),
 FOREIGN KEY(trial_id,choice) REFERENCES daily_choices(trial_id,position)
);
CREATE TABLE IF NOT EXISTS daily_results (
 trial_id text PRIMARY KEY REFERENCES daily_trials(id),
 reason text NOT NULL CHECK(reason IN ('WINNER','TIE','INSUFFICIENT_PARTICIPATION')),
 total integer NOT NULL, counts_json text NOT NULL, created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_votes_user ON daily_votes(user_id,created_at);
INSERT INTO migrations(version,applied_at) VALUES
 (2,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
ON CONFLICT(version) DO NOTHING;
