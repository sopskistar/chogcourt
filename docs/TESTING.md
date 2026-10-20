# Validation record

## Local feature errors and stale backend — 2026-10-20

Started from clean `main` at `be1311d77f65512c9a5d58392605b8cbe53d4a92`. The actual development process on `127.0.0.1:4173` was still serving the schema-1 backend: `/api/daily` returned 404, `/api/config` lacked `daily`, and the old profile contract lacked `dailyHistory`. The server serves current HTML from disk but imports backend modules only at startup. Current source already registers the correct routes; no duplicate route, court-rule change or backend rewrite was needed.

Fixed the frontend's unconditional history `.length` access. Missing/invalid profile sections now produce explicit unavailable/retry states, preserve valid statistics and case records, and are not presented as empty history or zero activity. Missing Daily Docket routes and incomplete responses have actionable errors. Loading, genuine empty records and API failures remain distinct.

Sequential checks:

| Executed check | Result |
| --- | --- |
| `npm test` | **36 passed, 0 failed** (22 court/daily + 14 wallet/safety) |
| `npm run test:frontend` | **21 passed, 0 failed** |
| `npm run test:browser` | **32 passed, 0 failed**, zero uncaught JavaScript exceptions |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Actual local API/browser smoke after restart | Passed: schema 3; Daily Docket 200; unauthenticated profile 401; disabled nominations; Daily Docket, Reputation, Verdict Machine, Case of the Day and Account rendered correctly |
| Local SQLite backup/migration comparison | Integrity check passed; every pre-existing non-migration table's rows matched the backup exactly |

Reports: `/tmp/chogcourt-frontend-dl7fqF/report.json` and `/tmp/chog-app-13xRyW/report.json`. Chromium coverage includes both themes at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800 and 844×390, plus the existing 21-configuration motion suite. Firefox, WebKit and physical devices were not tested.

The complete browser journey registered separate accounts, filed a real test-database case, hashed evidence, rejected duplicate evidence, submitted the defendant response, recorded three eligible jury votes, finalized after the test deadline, and checked the same result in the docket, verdict listings, Verdict Machine and reputation. Refresh/new-login persistence, SVG export, gallery and navigation also passed. Community Court uses a temporary database and injected test clock; the separate Daily Docket demo waited an actual 60 seconds. No test accounts, cases, evidence, votes or verdicts were inserted into the normal database. Legacy/malformed-response tests intercept fetch only inside the test browser; wallet tests use labelled RPC fixtures and real cryptographic test signatures, not real user ownership.

Before restarting the confirmed **local development** process, a consistent SQLite online backup was made at `data/before-feature-fix-YebBxK/court.sqlite` (ignored, private permissions, integrity checked). Existing additive migrations 002/003 were then applied by normal startup. The original one user and one session were preserved, and all existing court-record tables remained empty. Normal 86400-second evidence/voting windows, quorum 3 and account jury policy were verified unchanged. The local server is available on port 4173; reload the browser to use it.

An attempted development-only watch-mode enhancement failed its actual startup check: Node 22.23.1 tried to watch the absent optional `.env` and raised `ENOENT`. That enhancement was removed, restoring the original working `npm run dev` command; no `.env` was invented or required. Documentation explicitly instructs restarting the local backend after backend updates. An initial process-stop safety guard rejected the command shape and took no action; the exact process arguments were inspected before stopping only the verified stale development process.

Case of the Day still requires implementation of `$CHOG` eligibility/nomination policy and checks; Genesis identity verification does not enable it. The current Genesis wallet integration exists, but no real wallet extension, user signature or live RPC ownership check was performed in this repair. No deployment, production restart/settings change, blockchain transaction or court-rule change occurred.

Changed files: `index.html`, `tests/application.mjs`, `tests/backend.test.mjs`, `README.md`, `docs/DEPLOYMENT.md`, and `docs/TESTING.md`. Server code, migrations, package commands, artwork, fonts and animation settings are unchanged.

## Free-hosting audit and pre-push verification — 2026-10-20

Inspected the existing uncommitted wallet implementation on `main` at `1519810`; Daily Docket commit `4756e86a696850a0f3cbdfc3a4e99cfd4ef16ce0` remains an ancestor. A fresh fetch showed local/remote `main` equal before the new commit. GitHub reported push permission, no deployments, no checks/status integrations and no repository webhooks. No local Vercel link/config, workflow, `.env`/`.env.local`, or runtime hosting/database configuration was present. No hosting account, database migration, normal server restart, production setting or deployment was performed.

Final sequential verification:

| Executed check | Result |
| --- | --- |
| `npm test` | **35 passed, 0 failed** (21 court/daily + 14 wallet/safety) |
| `npm run test:frontend` | **21 passed, 0 failed** |
| `npm run test:browser` | **28 passed, 0 failed**, zero uncaught JS exceptions |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Built-artifact smoke | Vendored signature recovery, schema 3 in memory, and exclusion of `.env`, data and local-demo script passed |
| Read-only committed comparison | Existing claims route block, daily module, court rules, schemas 001/002, demo runner, server runtime and Dockerfile unchanged |

Reports: `/tmp/chogcourt-frontend-OfntcI/report.json` and `/tmp/chog-app-vIrLIj/report.json`. Browser coverage remains Chromium only, including both themes and 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800 and 844×390. The motion suite retains its 21 configurations. The application suite again completed the real-time 60-second local Daily Docket with separate accounts and fresh temporary storage. Real wallet extensions, Firefox, WebKit, physical devices and a hosted deployment were not tested. The earlier real Monad observation below was not rerun during this hosting audit; automated wallet ownership uses labelled RPC fixtures with real cryptographic test signatures.

**Failure found and fixed, not skipped:** the first browser rerun stopped at the signed-wallet mobile resize (`/tmp/chog-app-MA2Trm/report.json`, five checks completed). Diagnostics showed `clientWidth=390` but `--s=375/1280`. A separate in-memory browser experiment reproduced a document scrollbar change from 1265 to 1280 pixels without a window `resize` event; the old scale stayed at 1265/1280. `index.html` now observes document-width changes and schedules the existing `fit()` formula. The added regression toggles document scrollbar visibility at a fixed window size and requires the correct scale. No timing, crop, entrance, font or existing assertion was weakened. All suites above were then rerun sequentially and passed. A sandbox-denied read-only Git subprocess comparison was rerun with permission and passed.

Hosting findings and owner-only setup instructions are recorded in [DEPLOYMENT.md](DEPLOYMENT.md). Only `.env.example` comments changed; its values, court defaults and the database architecture were preserved. README's stale no-runtime-library statement was corrected to describe the vendored verifier. The staged whitespace check also caught redundant trailing blank lines in the two newly added license files; those blank lines were removed without changing license text. The code and tests were reviewed for source delivery; commit/push identifiers are reported separately after GitHub confirmation.

## Signed wallets and Chog Genesis ownership — 2026-10-20

Started from clean `main`; preserved Daily Docket commit `4756e86a696850a0f3cbdfc3a4e99cfd4ef16ce0`. No existing app was restarted and no normal/production database was opened. All database tests used memory or fresh temporary files. Suites were run sequentially.

| Executed check | Final result |
| --- | --- |
| `npm test` | **35 passed, 0 failed**: 21 court/daily tests + 14 wallet/safety tests |
| `npm run test:frontend` | **21 passed, 0 failed**, including the original motion/entrance suite |
| `npm run test:browser` | **27 passed, 0 failed**, no uncaught JS exceptions; real 60-second demo included |
| `npm run build` | Passed; ignored `dist/` includes the server-side verifier and schema 003 |
| `git diff --check` | Passed |
| Read-only committed-file comparison | Claims route block, court rules, daily module, schemas 001/002, demo runner, Dockerfile, `.env.example`, deployment documentation and embedded fonts unchanged |
| New inspector against live public Monad RPC | Passed: chain 143, fixed collection, ERC-165/721, balance and `ownerOf(476)`, number-pinned reads with final block-hash check |

Final reports: `/tmp/chogcourt-frontend-W4oL3w/report.json` and `/tmp/chog-app-9SKe2v/report.json`. These are local temporary artifacts, not deployed URLs. Chromium was used; Firefox/WebKit and physical devices were not tested. Full browser checks cover 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800 and 844×390 in both themes; frontend regression retains 21 device/viewport configurations. The new verified-wallet panel was also checked at 390×844 in both themes.

Live RPC smoke: contract `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`, block `0x6dae0ce`, hash `0xb8f367f252f9194ee59baa84dd0205befa899beedde933709444739c83b8c885`. It read the public owner of token 476, then successfully observed that address holding 2 NFTs and owning token 476. No address was asserted to belong to the user, no signature was requested from that owner, and no token record was saved. The raw inspector correctly retained `walletAuthenticated:false` and `ownershipVerified:false`; authentication needs a valid signature. This was a real network read, not a mocked holder result.

New automated coverage: real cryptographic signatures from disposable unfunded test keys; domain/message/signer mismatch; nonce/session binding, replay, expiry and rate limits; CSRF/origin restrictions; optional token IDs; no-holder/wrong-owner/nonexistent-token cases; chain/interface validation; malformed RPC, timeout, outage and changed-block failures; transfer rechecks and clearing stale observations; disconnect/logout during in-flight reads; one-hour expiry; SQLite persistence and additive v2→v3 upgrade without changing daily records. Browser signing uses an explicitly injected test provider and labelled RPC fixtures, never production mock ownership. Wallet rejection, signature success, token key in Reputation, transfer/nonholder results, outage and chain-change revocation are exercised through the real API/UI.

Failures investigated: sandbox initially denied localhost binding (`EPERM`); reruns with permission passed. An application run timed out waiting for a new test page's mobile layout; diagnostics were added and viewport checks now foreground the page before resizing, retaining the original strict mode/scale and overflow assertions. A subsequent run reached the nomination screen and found changed wording no longer contained the original explicit unverified-balance text; the UI now preserves that warning while distinguishing verified NFT identity from unverified $CHOG balances. The final complete run passed; no assertions were removed or skipped.

No real browser-wallet extension, hardware wallet, user signature, Docker execution or live deployment was tested. Follow [BLOCKCHAIN.md](BLOCKCHAIN.md) for the required human wallet test. NFT-gated jury voting, EIP-1271/QR wallets and $CHOG nominations remain unavailable; account court/Daily Docket behavior is unchanged. No hosting/production settings, contract deployment, spending, commit or push occurred.

Changed files: `README.md`, `docs/API.md`, `docs/BLOCKCHAIN.md`, `docs/TESTING.md`, `index.html`, `server/app.mjs`, `server/database.mjs`, `server/wallet.mjs`, `tests/application.mjs`, `tests/backend.test.mjs`, `tests/wallet.test.mjs`. Added: `server/wallet-auth.mjs`, `server/migrations/003_wallet_auth.sql`, `server/vendor/ethers-6.17.0.mjs`, `server/vendor/LICENSE-ethers.md`, `server/vendor/THIRD-PARTY-LICENSES.md`, `server/vendor/README.md`. The pinned verifier's npm tarball integrity was checked before vendoring; no frontend library or npm install requirement was introduced.

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
