# Vercel + Neon deployment

This is the deployment path for the async PostgreSQL backend. No Vercel deployment, Neon project/database, production settings, or data migration has been performed. The old SQLite implementation and its data remain local and unchanged.

## Runtime and persistence

The vanilla frontend is emitted to `dist/` by `npm run build:vercel`; a Vercel rewrite sends `/api/*` to the Node.js Function at `api/index.mjs`, carrying the original route path in an internal query parameter. The function dispatches through the same route handler used by the local Node server. Vercel's `includeFiles` setting explicitly bundles the PostgreSQL migration files used on cold initialization. Artwork remains under `/assets/images/`. Vercel does not run `server/index.mjs` as a listening server.

The Vercel handler uses `pg` and `DATABASE_URL`. It does not import or open `node:sqlite`. Every API query is asynchronous and parameterized. Multi-step writes use a PostgreSQL transaction on one checked-out client; case deadline transitions lock the case row, and database unique constraints protect duplicate evidence, responses, readiness and votes across concurrent function instances. Evidence bytes and SHA-256 digests remain private in PostgreSQL `BYTEA`; downloads remain authenticated, attachment-only responses. Nothing is written on-chain.

The first API invocation applies PostgreSQL migrations 001–003 inside a transaction protected by a PostgreSQL advisory lock. This is safe when several cold Vercel instances arrive together and can be retried on later invocations. The migrations create all account, session, court, evidence, response, jury, verdict, history, Daily Docket, wallet-observation and rate-limit tables. This creates an empty Neon schema; SQLite data is **not** copied or automatically migrated. A deployment must not point `DATABASE_URL` at a database containing unrelated tables named for this app.

The `pg` pool is created once per warm Function module, capped at one connection per instance, and can be recreated after cold starts. Use Neon's pooled connection string to limit connection pressure as Vercel scales. Fixed-window authentication/write rate limits are stored in PostgreSQL so they are shared across function instances; the exact IP header handling remains subject to Vercel's proxy contract.

Node.js 22.16 or later is required by `package.json`. The Vercel Function uses standard Web `Request`/`Response` handlers and Node APIs. Vercel's build publishes only `index.html` and `assets/` as static output; it does not publish `.env`, SQLite files, backend source or database credentials.

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, using Production for the public demo. Keep credentials in Vercel's encrypted environment settings; never add them to Git or paste them into chat.

| Name | Value | Required |
| --- | --- | --- |
| `DATABASE_URL` | Neon PostgreSQL **pooled** connection string; copy it from Neon’s connection details for the app role and keep its SSL parameters | Yes |
| `PUBLIC_ORIGIN` | The exact canonical HTTPS origin assigned in Vercel Domains, e.g. copy the visible project domain as `https://…`; no path or trailing slash | Yes |
| `JURY_POLICY` | `account` | Recommended; `nft` deliberately rejects jury votes |
| `MIN_QUORUM` | `3` | Optional; this is the default and preserves the current rule |
| `EVIDENCE_SECONDS` | `86400` | Optional; this is the default 24-hour evidence window |
| `VOTING_SECONDS` | `86400` | Optional; this is the default 24-hour voting window |
| `REGISTRATION_CODE` | A private invitation code, if you want closed registration | Optional; omit for open registration |
| `MONAD_RPC_URL` | A trusted HTTPS Monad RPC endpoint | Optional; the current public endpoint is used when omitted |

Vercel supplies `NODE_ENV`; do not configure `HOST`, `IP`, `PORT`, `DATABASE_PATH` or `NODEJS_VERSION` for this Function deployment. Do not use a local SQLite file or a Vercel temporary directory as persistent storage.

`PUBLIC_ORIGIN` is used for CSRF origin checks, wallet challenge messages and production session cookies. Set it to the production domain attached to the project. Preview deployments use different hostnames and will reject cross-origin writes while this value points at production; use production for the demo, or configure a stable preview domain/origin deliberately before testing previews.

## Create Neon and connect Vercel

1. In Neon, create a new project for Chog Court. Choose a region close to the Vercel Function region you intend to use. Create/use the default database and a dedicated app role; do not reuse a database containing unrelated application tables.
2. In Neon’s **Connect** panel, select the project database, app role and Node.js. Copy the pooled connection string (the pooler hostname is indicated in Neon’s connection details). Treat it as a secret. Keep Neon’s SSL option enabled.
3. In Vercel, choose **Add New → Project → Import Git Repository**, select `sopskistar/chogcourt`, and set the production branch to `main`. The repository root is the project root. Keep the detected `vercel.json` settings: build command `npm run build:vercel`, output directory `dist`; Vercel installs the pinned npm dependencies from `package-lock.json`.
4. Add `DATABASE_URL` and the exact canonical `PUBLIC_ORIGIN` to the Production environment. Add `JURY_POLICY=account`, `MIN_QUORUM=3`, `EVIDENCE_SECONDS=86400`, and `VOTING_SECONDS=86400` if you want every setting explicit. Add a strong private `REGISTRATION_CODE` for a controlled demo. Do not put values in Vercel’s client-exposed `NEXT_PUBLIC_*` namespace.
5. Select Node.js 22.x or a newer supported major in Vercel project settings. Confirm it satisfies Node 22.16+. Set the Function region near the Neon project region if the Vercel plan/settings expose that option; use the actual regions shown by those dashboards rather than guessing.
6. Start the first deployment only after the database and environment values are configured. No migration command is needed: the first API request applies the schema transactionally. A failed or partial initialization rolls back and can be retried.
7. Verify `GET https://<the-copied-production-domain>/api/health` returns `{ "ok": true, "database": "postgres", "schema": 3 }`. Then perform the case journey below with test accounts. Confirm the browser remains on that same HTTPS origin and that refresh/login preserves the records.

The checked-in code is prepared for GitHub-triggered deployments, but pushing a commit to `main` can trigger Vercel automatically if the project is connected. Review the commit and configure Neon/Vercel first; push the approved commit only when you intend to trigger the first deployment. No deployment is authorized by this document.

## Demo journey and timing

Register separate plaintiff, defendant and three juror accounts. File a case, submit an evidence note or file and a defendant response, then have both parties mark the evidence phase ready. Three non-party accounts vote. The result stays hidden until the voting deadline; refresh afterwards to finalize and inspect the verdict/history. Reload and log back in to confirm persistence.

The default evidence and voting windows are each 24 hours. Both parties can end the evidence phase early with **Ready**, but the vote deadline remains a full 24 hours. Changing `EVIDENCE_SECONDS` or `VOTING_SECONDS` changes the rules recorded on newly filed cases. Keep the defaults for a rules-faithful public demo; a same-day final verdict is not possible unless a shorter demo policy is explicitly chosen before filing.

## Tests

Run the credential-free checks locally:

```sh
npm ci
npm test
npm run test:frontend
npm run build
npm run build:vercel
```

These execute route and journey tests against isolated SQLite fixtures, PostgreSQL adapter/schema-contract tests against a fake `pg` pool, static frontend tests and both build checks. They do **not** prove SQL behavior against Neon. The API adapter tests verify parameter translation, client-bound transaction commit/rollback and schema initialization coordination, but not a live Postgres server.

Optional full PostgreSQL API integration uses a disposable local PostgreSQL database (or a dedicated empty Neon test database):

```sh
TEST_DATABASE_URL='postgresql://<test-role>:<test-password>@127.0.0.1:5432/<disposable-test-db>?sslmode=disable' npm run test:postgres:integration
```

The script creates a random isolated schema, initializes it, runs register → file case → evidence/response → vote → verdict/history → re-login persistence checks, then drops only that test schema. Remote database URLs require the explicit opt-in `ALLOW_REMOTE_TEST_DATABASE=1`; never point it at production. No Neon integration has been run until this command succeeds against a dedicated Neon test database.

## Existing SQLite data

The local SQLite implementation, `data/`, and SQLite migrations 001–003 remain available for development and backup. Vercel production starts with a separate, empty PostgreSQL database. If local records ever need to move, that requires a separately reviewed export/import tool with schema mapping and evidence-byte validation; no implicit or automatic conversion is included.
