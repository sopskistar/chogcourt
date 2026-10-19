# Chog Court API v1

Same-origin JSON over HTTP locally, HTTPS in production. Records are **shared off-chain SQLite records**, not blockchain confirmations. No previous backend existed in the repository; the requested `/api/claims` paths are implemented here.

## Authentication

`POST /api/auth/register` accepts `{ "username": "court_user", "password": "a-unique-long-password", "invitation": "optional-code" }`. Usernames are case-insensitive, 3–30 letters/numbers/underscores. Passwords are 12–128 characters, salted and hashed with scrypt. An invitation is required only when `REGISTRATION_CODE` is configured. Registration creates a court account, not a verified person, wallet, or NFT owner.

`POST /api/auth/login` accepts username/password. Both routes return `{user, csrf}` and an opaque HttpOnly, SameSite=Lax session cookie (Secure in production). Sessions expire after seven days. Only the token hash is stored. `GET /api/auth/me` returns the current public user and CSRF token, or nulls. `POST /api/auth/logout` revokes the session.

All writes except login/registration require the cookie, `Content-Type: application/json`, and `X-CSRF-Token` from `/api/auth/me`. Cross-origin writes are rejected. No CORS authorization is granted. Responses do not expose password hashes or salts. Password reset and email verification are not implemented.

## Endpoints

| Method / path | Request / response |
| --- | --- |
| `GET /api/health` | `{ok:true,database:"sqlite",schema:2}` after a database check |
| `GET /api/config` | Court rules, account/NFT jury policy, published token metadata and disabled integration flags |
| `GET /api/claims?offset=0` | `{cases,nextOffset}`; 50 cases per page, newest first |
| `POST /api/claims` | `{title,category,argument,defendant}`; returns case, 201 |
| `GET /api/claims/:id` | Full case, both party usernames, deadlines, participation, eligibility for current account, response and optional final verdict |
| `GET /api/claims/:id/evidence` | `{evidence:[{id,label,mime_type,sha256,byte_length,created_at,author}]}` |
| `POST /api/claims/:id/evidence` | `{label,text}` **or** `{label,base64}`; one payload, parties only, 201 |
| `GET /api/evidence/:id/content` | Exact evidence bytes as a download attachment, never executable inline HTML |
| `POST /api/claims/:id/response` | `{body}`; assigned defendant only, one response, 201 |
| `POST /api/claims/:id/ready` | `{}`; party irrevocably closes its own evidence/response window, 201 |
| `POST /api/claims/:id/votes` | `{choice:"GUILTY"\|"INNOCENT"\|"NOT_ENOUGH_EVIDENCE"}`; eligible non-party account only, 201 |
| `POST /api/claims/:id/adjudicate` | `{}`; authenticated request, returns finalized result only after voting deadline; 409 if too early |
| `GET /api/claims/:id/verdict` | Persisted final result; 409 while pending |
| `GET /api/claims/:id/history` | Ordered case events, actor username, timestamp and detail; vote choices are not exposed in interim history |
| `GET /api/profile` | Signed-in user's actual participation, badges, score, case history and separate `dailyHistory` (latest 20 submitted/voted questions) |
| `GET /api/reputation?chainId=…&collectionAddress=…&tokenId=…` | Historical verified NFT record, if one exists; 404 for unverified identities |
| `GET /api/nominations` | Disabled status and exact verification blockers; no fabricated featured case |
| `POST /api/nominations` | Always 503 until verified holder integration and a published policy are implemented |
| `POST /api/wallet/challenge` | Always 503; no supported wallet authentication flow has been enabled |

Unknown fields on implemented case mutations are rejected. Clients cannot choose another plaintiff, supply final outcomes, forge NFT associations, or override deadlines/quorum. Case categories are `Community`, `Memes`, `Chog lore`. A defendant must be an existing, different active account.

## Lifecycle and verdict rules

These rules apply to Community Court `/api/claims`, not the separate Daily Docket below. They have not changed.

`OPEN → EVIDENCE_RESPONSE → VOTING → FINALIZED`.

Cases start OPEN. A first evidence submission, response, or party readiness moves them into EVIDENCE_RESPONSE. Voting begins at the evidence deadline or once both parties have explicitly closed their evidence windows. A timed OPEN case with no submissions can move directly to VOTING. Defaults are 24 hours for evidence and 24 hours for voting; rules are copied into each new case and do not change when environment settings later change.

Phases advance during case retrieval or mutations, including after long idle periods. No background scheduler is required. A response deadline starts a voting period at that deadline, not at the next visit. Both-party early readiness starts a full voting period immediately. A party cannot add evidence or respond after marking itself ready. Case parties never vote.

The default `account` jury policy allows active authenticated accounts other than the parties. It is deliberately not called NFT verification or one-human-one-vote: multiple accounts remain a Sybil risk. `nft` policy fails closed until an independently verified ownership adapter exists. SQLite primary/unique keys enforce one vote per account/case and reserve one vote per verified NFT/case.

At the voting deadline, the server counts accepted votes in a transaction and persists exactly one verdict. Default quorum is 3. A unique plurality wins when quorum is met. A tie or insufficient quorum yields `NOT_ENOUGH_EVIDENCE`, with reason `TIE` or `INSUFFICIENT_QUORUM`; otherwise the reason is `PLURALITY`. Finalization is idempotent. Interim counts expose participation only, not other jurors' choices. The viewer can see their own vote. Accusations, reputation and Chaos Meter values never affect verdict calculation.

## Evidence, participation and identity

Text evidence is trimmed then encoded as UTF-8; SHA-256 is calculated over those stored bytes. File evidence is base64-decoded and hashed without transformation. Downloads return the exact stored bytes. The same hash on the same case is rejected even when another party submits it. Limits: 20 evidence items per case; a text note is 20–20,000 characters; a binary item is 1 byte–1 MiB; the JSON request ceiling is 1.5 MB. Evidence is public and not malware-scanned. A hash identifies bytes; it does not prove authenticity or truth.

Shared achievements use server-accepted vote timestamps: First Vote = 1, Consistent Juror = 5 cases, Jury Streak = 3 consecutive UTC dates. The current run ends today or yesterday; longest run keeps the badge earned after a gap. Shared participation score is `min(100, 10 × accepted votes + 5 × distinct cases with submitted evidence)`. Local practice records are never imported as authoritative activity.

Shared Chaos is `min(100, 8 × min(5,evidence items) + 4 × min(15,eligible account votes))`. Labels are Low Chaos (0–24), Court Is Heating Up (25–59), Maximum Chaos (60–100). Account jury participation is explicitly not NFT-holder participation.

NFT identity uses `eip155:<chainId>:erc721:<lowercase collection>/<decimal tokenId>`. Historical case references use that key; ownership is separate metadata. `saveVerifiedToken` is an internal persistence boundary, not verification by itself. Only tests currently inject ownership proofs, explicitly marked test fixtures. No public route accepts client-supplied verification or attaches an unverified token to a real case. See [blockchain status](BLOCKCHAIN.md).

## Errors and operational limits

Errors use `{ "error": { "code": "…", "message": "…" } }` with 400 malformed JSON, 401 authentication, 403 authorization/CSRF/origin, 404 missing record, 409 duplicate/phase conflict, 413 size limit, 415 content type, 422 validation, 429 rate limit, 503 unavailable integration. Unexpected errors return a generic 500; stack traces and SQL are not sent to browsers.

Login/registration: 20 attempts per source IP per minute. Authenticated writes: 60 per account per minute. Case creation: 20 per account per rolling 24 hours. In-memory request limits are per process and reset on restart; deploy one instance with the SQLite volume. Reverse-proxy traffic currently shares its proxy IP bucket; do not trust arbitrary client-forwarded IP headers.

## Daily Docket

Uses the same sessions, active-account checks, CSRF/origin checks and write rate limit. No NFT policy or wallet requirements apply. Daily records and results are separate from claims and never update jury badges, streaks, score, or verdicts.

| Method / path | Request / response |
| --- | --- |
| `GET /api/daily` | `{config,server_time,current,next,previous,history,can_submit}`; previous = latest 5 results, history = current account's latest 20 submitted/voted questions |
| `POST /api/daily` | `{question,choices:["First choice","Second choice"]}`; returns question, 201 |
| `GET /api/daily/:id` | Queued, voting or closed question; 404 if missing |
| `POST /api/daily/:id/votes` | `{choice:0}`; zero-based choice position, returns question, 201 |

Question: 8–160 trimmed characters. Exactly 2–4 different case-insensitive trimmed text choices, 1–120 characters each. Unknown fields rejected. One QUEUED question per author; an author may submit the next question after their previous one opens. Questions and choices cannot be edited. No uploaded contestant entries.

Question fields include `id`, `question`, `author`, `author_id`, `state` (`QUEUED`, `VOTING`, `CLOSED`), `slot`, `opened_at`, `closes_at`, `min_quorum:3`, `choices:[{position,label}]`, `participation`, `my_choice` (null or integer), `eligibility`, `result`, and `source`. Public results never reveal individual other voters' choices.

Selection/finalization runs in a SQLite transaction on daily requests and profile history reads. One question per UTC date; oldest eligible queued question first, deterministic insertion-order tie breaking. A late opening still closes at the next UTC midnight. Expired questions close on the next request; future slots are not backfilled after idle days. Empty queues stay empty until someone submits. Choice counts remain absent until closing.

At least 3 votes are required. Result `{reason,total,counts:[{position,votes}],finalized_at}` has reason `WINNER` for one highest count with quorum, `TIE` for tied highest counts with quorum, or `INSUFFICIENT_PARTICIPATION` below quorum (including zero votes). A winner is the unique leading choice, not a GUILTY/INNOCENT finding. Counts are stored once; no public edit/reopen endpoint exists. Finalized time is processing time, potentially later than the deadline.

`/api/config` adds `daily:{demo,windowSeconds,quorum,closing}`. Normal: 86400-second UTC slots. Only the dedicated fresh temporary-database runner uses 60 seconds from opening, with `source:local-demo`; no environment switch can shorten normal trials. In that runner the next question opens on the first request after closing, receiving a full new 60-second window. Existing claim rules remain independent.

Additional errors: `QUEUE_LIMIT` 409, `AUTHOR_VOTE` 403, `INVALID_CHOICE` 422, `DUPLICATE_VOTE` 409, `PHASE_CLOSED` 409. Authentication and server validation are authoritative even if the browser countdown is stale.
