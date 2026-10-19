# Validation record

## Wallet safety and deployment preparation — 2026-10-19

The starting checkout was clean `main`, one commit ahead of `origin/main`, with Daily Docket commit `4756e86a696850a0f3cbdfc3a4e99cfd4ef16ce0` intact. No existing implementation was rebuilt. Checks ran sequentially:

| Command/check | Actual final result |
| --- | --- |
| `npm test` | 27 passed, 0 failed: original 21 court/daily tests, then 6 wallet/deployment safety tests |
| `npm run test:frontend` | 21 passed, 0 failed |
| `npm run test:browser` | 26 passed, 0 failed (22 existing + 4 wallet checks) |
| `npm run build` | Passed; validated Node/static artifact regenerated in ignored `dist/` |
| `git diff --check` | Passed |
| Read-only comparison against `4756e86` | Claims route block, daily module, court rules, database/migrations and demo runner unchanged |
| Real public Monad RPC | HTTP 200, chain `0x8f` / 143; supplied reference rejects ERC-721 support, `decimals()` = 18 |
| New inspector against real Monad RPC | `NOT_ERC721`, all ownership/authentication/eligibility/trust flags false; block `0x6d83250`, hash `0xc9d1f412b59112cdde907fc561ddb14eb571fcfa23434924004e80031ce8b427` |

Browser report: `/tmp/chog-app-nizBg8/report.json` (26 checks, no uncaught exceptions). Frontend report: `/tmp/chogcourt-frontend-7ciwhj/report.json` (21 checks, no failed requests). These are temporary local artifacts, not public URLs.

New backend coverage: exact read-only RPC methods/fixed contract/block reference, no fungible balance-to-NFT conversion, explicit fail-closed behavior even if a contract reports ERC-721 support, wrong chain, no contract code, malformed responses, rate limits, simulated transport/timeouts, credential-safe errors, authentication/CSRF/origin/input restrictions, no identity writes, and Vercel refusal before database access/build output. These deterministic tests use labelled RPC fixtures.

New browser coverage uses an **injected test wallet**, not a real extension: missing provider, rejected connection, address display, wrong chain, switching chain, account/network changes, RPC failure, empty accounts, disconnect events, late-response cancellation, reload privacy, unchanged court login, keyboard focus, and light/purple panel contrast/overflow at 1440×900 and 390×844. It asserts that only account/network connection methods are requested—no signatures, approvals or transactions. Existing full-app coverage passes at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800 and 844×390, with the original 21-configuration motion suite retained. Chromium only; Firefox, WebKit and physical devices were not tested.

The Daily Docket browser test again waited a real 60 seconds using fresh temporary storage, separate accounts and real submitted votes, then checked the result and next trial. Other tests use in-memory or temporary databases. No normal/production database was opened or migrated, and no existing application server was restarted.

Initial sandbox runs could not bind localhost (`EPERM`), and a read-only Git subprocess comparison was blocked. These were rerun with permission; the final complete runs passed. No application failure or assertion was hidden, skipped or weakened.

The real inspector smoke used a zero-address placeholder **only as an untrusted diagnostic input**; it did not query that address's balance or establish any NFT ownership. A real wallet connection, wallet signature, NFT-holder action, Docker execution or live deployment was **not tested**. The NFT-essential requirement remains blocked by the collection-reference mismatch, as explained in [BLOCKCHAIN.md](BLOCKCHAIN.md). Deployment requires the approved persistent host described in [DEPLOYMENT.md](DEPLOYMENT.md).

Changed-file manifest: `.env.example`, `.gitignore`, `README.md`, `docs/API.md`, `docs/BLOCKCHAIN.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `index.html`, `package.json`, `scripts/build.mjs`, `server/app.mjs`, `server/index.mjs`, `tests/application.mjs`; added `server/wallet.mjs` and `tests/wallet.test.mjs`. No image/font, schema, court rule or Daily Docket implementation changes. No spending, smart-contract deployment or application deployment was performed.

## Daily Docket enhancement — 2026-10-19

Final checks were run sequentially, with browser suites not competing for CPU:

| Command | Final result |
| --- | --- |
| `npm test` | 21 passed, 0 failed (the original 12 court tests plus 9 daily/migration/demo checks) |
| `npm run test:frontend` | 21 passed, 0 failed |
| `npm run test:browser` | 22 passed, 0 failed |
| `npm run build` | Passed; regenerated after session recovery to confirm completion |
| `git diff --check` | Passed |
| `npm run demo` smoke check | Passed on 127.0.0.1:4174; stopped afterward |

Final browser report: `/tmp/chog-app-X2EB8y/report.json`. Final frontend report: `/tmp/chogcourt-frontend-pudMlT/report.json`. These are local temporary artifacts, not repository files or public URLs. Backend results were recorded in the terminal. The real-time demo screenshot was inspected.

New coverage: submission validation and text escaping, immutable choices, one queued question per author, authenticated/non-author voting, inactive-account rejection, duplicate voting, hidden interim tallies, actual plurality/tie/insufficient-participation results, exact UTC boundary, idempotent concurrent rollover, FIFO selection without backfilled dates, unchanged claims, restart persistence, history with no jury-score changes, and daily account access while NFT court voting is unavailable. Migration tests create a populated temporary v1 database, upgrade it, compare preserved rows, and reopen v2 idempotently.

The browser suite registers independent users, submits two questions through the forms, votes, reveals the result, opens the next question and checks refresh persistence. Its separate local-demo test uses a fresh temporary database and waits an **actual 60 seconds**, without changing the clock, before checking a stored three-vote result and the next trial. No users or votes are seeded in the demo runner. Backend safety checks reject public Host headers, non-loopback bindings, production mode and inherited deployment settings; normal databases retain UTC-day trials. Demo sessions use a different cookie name from normal court sessions.

Chromium was tested in both themes at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800 and 844×390. Existing frontend checks also retain 21 viewport/device configurations, motion, reduced-motion and menu coverage. Firefox, WebKit and physical devices were not tested.

Failures investigated during this enhancement:

- Sandbox restrictions initially prevented localhost binding (`EPERM`); suites were rerun with approved local-server/browser access.
- The forged-Host test initially used Node fetch, which normalized the Host header. It now uses Node HTTP to send the actual forged header and asserts rejection, rather than weakening the safety check.
- An intermediate browser run inspected a header still using the previous viewport's scale after a fixed 80 ms delay. The test now waits for the requested viewport, CSS mode and calculated scale before applying the unchanged overflow/overlap assertions. No animation constants or application resize behavior were changed. The subsequent full run passed all 22 checks.

An additional actual `npm run demo` smoke verified schema 2 health, the 60-second demo flag, unchanged 86400-second Community Court windows, demo-labelled HTML and all seven PNG responses. Its isolated database was `/tmp/chog-docket-demo-b9S6oB/demo.sqlite`; the server was stopped, and no normal or production database was opened. A read-only comparison confirmed that the existing claims/evidence/response/readiness/vote/verdict/history route block matches the preceding commit byte-for-byte. Court rules, migration 001, artwork and embedded fonts were preserved.

Changed files for this enhancement: `index.html`, `package.json`, `README.md`, `server/app.mjs`, `server/database.mjs`, `server/index.mjs`, `tests/backend.test.mjs`, `tests/application.mjs`, `docs/API.md`, `docs/DEPLOYMENT.md`, and `docs/TESTING.md`. Added: `server/daily.mjs`, `server/migrations/002_daily_trials.sql`, and `scripts/demo.mjs`.

No deployment, publishing, production migration, wallet integration, payments, or push was performed. The earlier validation record below is retained as historical context.

## Original frontend/backend validation — 2026-10-13

Validated locally on 2026-10-13 (America/New_York), using Node 22.23.1 and installed Chromium 1234. No physical phone, Firefox or WebKit executable was available. Docker was not built or run. No production deployment or live-domain verification occurred.

## Executed checks

| Command | Result |
| --- | --- |
| `npm test` | 12 passed, 0 failed |
| `npm run test:frontend` | 21 passed, 0 failed on final sequential run |
| `npm run test:browser` | 18 passed, 0 failed on two consecutive final runs |
| `npm run build` | Passed; validated production files copied to ignored `dist/` |
| `npm run db:migrate` | Passed; schema version 1 |
| `git diff --check` | Passed |

Run browser suites sequentially: the entrance test intentionally retains its strict frame-displacement assertion. One concurrent run of both browser suites failed that timing assertion under competing workloads; the unchanged assertion passed when run sequentially. Animation durations, crops and entrance constants were not adjusted to satisfy the test.

Backend coverage includes real shared accounts, session privacy, CSRF/origin checks, invalid inputs, evidence hashes and exact bytes, duplicate evidence, authorized defendant responses, deadlines, self/duplicate-vote rejection, hidden interim tallies, all outcome rules, quorum, ties, true UTC activity, persistence across database restarts, and unavailable blockchain actions. NFT-history transfer tests inject labelled test proofs; they do not verify a real NFT.

Browser coverage includes isolated users, actual forms and HTTP requests, refresh/login persistence, exported SVGs, clipboard fallback, all primary destinations, pending-verdict guards, outage/retry behavior, and separate local practice records. New tests verify exact branding, seven local PNG responses, both full themes, keyboard activation/focus, saved preferences after a genuine reload, storage denial, each enlarged gallery image, footer links and complete scrolling. Representative form, button, status and dialog text contrast is checked against 4.5:1. This is not a complete assistive-technology audit.

Both themes were tested at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800 and 844×390. The legacy motion suite additionally covers 21 viewport/device configurations, including wide screens and narrower phones. Screenshots of desktop/mobile themes, dialogs, footer and verdicts were reviewed. Original six image hashes and embedded font hashes match the previous committed bytes; the new logo copy matches its uploaded root original exactly.

## Failures investigated

- The earlier gallery `EncodingError` did not recur in three unchanged reruns. Tests now scroll each lazy image into view, await successful loading, and then assert decoding and natural proportions. Missing or broken images still fail; decode failures include image-state diagnostics.
- Reload checks could observe the previous document's ready flag before navigation committed. A document marker now requires the new document, followed by font readiness. Initial navigation also handles the legitimate interval before `documentElement` exists.
- A new keyboard test originally omitted CDP Enter's text payload. A diagnostic recorded only keydown/keyup and no click. Sending the real Enter payload produced keypress and trusted click, without any application workaround.
- The tablet portrait layout intentionally places copy beside the headline; overlap tests now check rectangle intersection rather than incorrectly requiring the copy below it.
- Screenshot review caught genuine desktop headline wrapping into the tagline. Approved wording now uses four explicit lines within the existing hero architecture.
- Long usernames could overflow reputation cards. Flexible children now allow wrapping without removing content.
- Rapid dialog reopen/close could steal focus through a queued close event. User close/Escape paths now restore focus synchronously; the existing keyboard assertions remain.
- A stale API failure could overwrite a newly selected static view, and stale records could affect export state. View generations now isolate completed records and errors; a regression test verifies the gallery survives a late API failure.

## Local runtime verification

The prior Python static preview was stopped through its retained session, then `npm run dev` started the Node app on `http://127.0.0.1:4173`. `GET /api/health` returned HTTP 200 with `{ "ok": true, "database": "sqlite", "schema": 1 }`; the logo returned HTTP 200/image/png. A separate Chromium smoke check confirmed the shared empty docket and theme toggle on that actual server without inserting demo records into its database.

Local success is not production deployment. Hosting configuration, persistent storage, real ownership verification, nomination policy, moderation, recovery and backups remain as documented in [DEPLOYMENT.md](DEPLOYMENT.md) and [BLOCKCHAIN.md](BLOCKCHAIN.md).

## Changed-file manifest

Modified existing files: `index.html`, `README.md`, `tests/frontend.mjs`.

Added files:

```text
.dockerignore
.env.example
.gitignore
Dockerfile
assets/images/chog-court-logo.png
docs/API.md
docs/BLOCKCHAIN.md
docs/BRANDING.md
docs/DEPLOYMENT.md
docs/TESTING.md
package.json
scripts/build.mjs
server/app.mjs
server/database.mjs
server/index.mjs
server/migrate.mjs
server/migrations/001_initial.sql
server/rules.mjs
tests/application.mjs
tests/backend.test.mjs
tests/browser-tools.mjs
```

The root `Chibi Purple Court Emblem.png` arrived separately via the user's existing upstream commit `5e84aab`; it was not rewritten. Six original gallery assets were unchanged. Generated build files, runtime databases, browser artifacts and local environment files are not committed.
