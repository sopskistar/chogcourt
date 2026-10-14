# Validation record

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
