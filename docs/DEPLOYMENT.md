# Deployment and operations

## Current deployment path

Chog Court uses **Vercel + Neon PostgreSQL** for the shared production app. Follow [VERCEL-NEON.md](VERCEL-NEON.md) for Vercel configuration, environment variables, schema setup, and the live journey. The Vercel Function in `api/index.mjs` serves the existing API; `scripts/build-vercel.mjs` emits the shared-mode frontend and artwork to `dist/`. Do not run the custom Node listener as a Vercel website process.

The local frontend remains a separate browser-only practice mode. The Vercel build adds `data-shared-court` to its generated HTML so the deployed UI uses court accounts and API-backed records. The source `index.html` intentionally remains unmarked for local practice.

## Local use

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. Local development uses SQLite and creates `data/chogcourt.sqlite`; the shared production backend uses Neon and does not import that database. Backend modules do not hot-reload, so restart `npm run dev` after server-code changes. Never commit `.env`, SQLite databases, browser profiles, or production evidence.

Run the deployment build and credential-free tests with:

```sh
npm run build:vercel
npm test
npm run test:frontend
npm run test:browser
```

The optional PostgreSQL integration journey requires a dedicated disposable database; see [VERCEL-NEON.md](VERCEL-NEON.md#tests). Never point integration tests at production.

## Local feature troubleshooting

`npm run dev` loads backend modules at startup and does not watch them. An old process can serve a newer page with older API routes or response fields. Restart only the local process after backend changes, then reload the browser.

| Symptom | Check |
| --- | --- |
| Daily Docket: `API route not found` | Check `/api/health` for schema 3 and `/api/config` for the `daily` settings. Restart the local backend if it predates the Daily Docket routes. |
| Reputation shows an error or incomplete history | A missing field is not the same as an empty history. Reload after updating the backend; the current UI presents unavailable sections with a retry state. |
| No finalized cases | This is expected before the voting deadline. Both parties can close evidence early, but the configured voting window still applies; refresh after it ends. |
| Sign-in or wallet controls are missing locally | The local source page is practice mode. Wallet identity is available only in the shared account flow; the Vercel build marks its generated page for that mode. |
| Case appears as “local practice” on the deployed site | Check the generated Vercel `dist/index.html` contains `<html lang="en" data-shared-court>`, then confirm the Production deployment uses the intended commit. Local practice records are browser-local, not Neon records. |

## Production checks

- Confirm `GET /api/health` returns HTTP 200 with `database: "postgres"` and schema 3.
- Confirm the deployed homepage is the shared court and the Court Account panel offers registration/sign-in.
- Use separate court accounts for the plaintiff, defendant, and at least three non-party jurors. Wallet connection is optional; account-based voting does not verify unique people or NFT ownership.
- File a case, submit evidence and a defendant response, have both parties mark the evidence phase ready, and collect three eligible votes. The verdict appears only after the case's recorded voting deadline; refresh then to finalize and inspect the vote breakdown and history.
- Confirm refresh and a new login preserve shared records. Do not create a production test case unless you intend it to remain in the public court.
- Evidence is public and has no malware scanning or moderation. Keep personal or confidential information out of uploads.
- Test wallet identity separately using the signed-message walkthrough in [BLOCKCHAIN.md](BLOCKCHAIN.md). Chog Genesis NFT identity is optional; it does not enable NFT-gated jury voting or $CHOG holder nominations.

## Environment and timing

The Vercel Function requires `DATABASE_URL` and `PUBLIC_ORIGIN`; Vercel supplies `NODE_ENV`. Optional values and their defaults are documented in [VERCEL-NEON.md](VERCEL-NEON.md#environment-variables). Do not configure `HOST`, `IP`, `PORT`, or `DATABASE_PATH` for this serverless deployment.

The default evidence and voting windows are each 24 hours, and the jury quorum is 3. Both parties can end the evidence phase early, but voting still runs for the recorded voting duration. Changing `EVIDENCE_SECONDS` or `VOTING_SECONDS` affects new cases only; make any explicitly chosen demo policy before filing. Deadline transitions are request-driven, so the app does not need a background worker.

## Daily Docket and local-only demonstration

The shared Daily Docket stores questions, votes, results, and participation in Neon. It uses account authentication, one UTC-day trial, and a quorum of 3. It is separate from dispute-case deadlines and does not require a wallet or token.

`npm run demo` runs an isolated local Daily Docket demonstration on loopback with a fresh temporary SQLite database. It does not read `.env`, use production data, or demonstrate the shared production case flow. Do not tunnel or publish it. See the timed walkthrough in [README.md](../README.md#reliable-local-60-second-demo).
