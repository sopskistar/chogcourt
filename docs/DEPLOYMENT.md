# Deployment and operations

## Current hosting status

Repository inspection found no existing host configuration, no GitHub Pages site, no GitHub deployments, no existing Sites project, and no hosting/database credentials in the runtime environment. GitHub is the source repository, not a running backend. No public URL can be claimed until a deployment target is connected and the live checks below pass.

The implemented runtime is **Node.js 22.16+ with persistent SQLite**. It requires a continuously available writable persistent disk and a single application instance. It is not compatible with static-only GitHub Pages, ephemeral serverless filesystems, or the Sites/Cloudflare Worker runtime as-is. A Sites deployment would require a D1 storage adapter and platform authentication integration; do not upload this SQLite server there unchanged.

## Vercel decision and shortest reliable submission path

The finalization audit found no linked `.vercel/project.json`, `vercel.json`, remote database adapter or configured durable hosted database. GitHub authentication works; no GitHub deployment records or deployment checks were returned. No hosting change or deployment is authorized by this preparation step.

**Do not import this as a working Vercel application yet.** The backend uses synchronous `node:sqlite`, local WAL files and SQLite transactions. [Vercel explicitly documents that its functions do not provide shared permanent local SQLite storage](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel). Pointing `DATABASE_PATH` at `/tmp`, adding `DATABASE_URL`, or uploading `dist/` does not solve this: static HTML alone has no shared API, and the current code has no remote database adapter. Build/startup now refuse `VERCEL=1` to prevent a misleading or data-losing deployment.

The smallest reliable alternative is the **existing single-instance Node/Docker service plus persistent disk**, following the configuration below. This preserves the architecture and needs no new DB service or wallet provider subscription. The owner must supply a compatible host account/target, a persistent disk, and approve any hosting cost and deployment. No paid resource has been provisioned. An already-owned persistent server is also suitable. Do not expose or publish `npm run demo`.

If Vercel remains mandatory, stop at preparation: choose and approve a durable remote database, implement/test its asynchronous storage adapter and Vercel request handler, then configure credentials and deploy with separate approval. A Vercel proxy to a persistent Node backend is another possibility but still requires that backend host and tested same-origin cookies/CSRF routing. Neither option has been silently implemented; neither is an environment-only change.

### Source delivery and owner actions

1. Review `git status --short --branch` and the tested commits. Preserve Daily Docket commit `4756e86a696850a0f3cbdfc3a4e99cfd4ef16ce0`.
2. Verify `git remote get-url origin` is `https://github.com/sopskistar/chogcourt.git`, then `git fetch origin`. Push only if `origin/main` is an ancestor of local `main`: `git merge-base --is-ancestor origin/main main` followed by `git push origin main:main`. Never force. If authentication fails, run `gh auth login --hostname github.com` locally; do not paste a token into chat.
3. For the recommended host, connect that repo/branch and follow **Connect a Node/Docker host** below. Confirm durable storage and costs before deployment; keep auto-deploy off until approved. Do not connect Vercel to `main` and expect this backend to run.
4. Configure the exact HTTPS `PUBLIC_ORIGIN`, persistent `DATABASE_PATH`, runtime values and optional invitation code in the host dashboard. For RPC diagnostics the default public URL is sufficient; no key is required. `.env.example` is a template, not production secrets.
5. After explicit deployment approval, deploy once, run `/api/health` and the complete live checklist below, including persistence after restart. Until then there is **no verified live URL**. Local browser tests are not live deployment tests.

## Local use

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. There are no npm dependencies to install. If another preview owns that port, stop that server first or select an unused port and matching `PUBLIC_ORIGIN` in `.env`. The server creates the SQLite file and applies migrations 001 and 002 as needed. `npm run db:migrate` also applies/checks the schema explicitly. Never commit `.env`, database files, or production evidence.

## Connect a Node/Docker host

1. Connect `sopskistar/chogcourt`, branch `main`, as a Node 22.16+ service or use the included `Dockerfile`.
2. Attach a **persistent** disk at `/app/data` (or the host's supplied mount path). Set `DATABASE_PATH` to `<persistent mount>/chogcourt.sqlite`. Keep one instance. Confirm the host's disk cost before provisioning; no paid resources have been provisioned by this task.
3. Set `HOST=0.0.0.0`, the host's `PORT`, `NODE_ENV=production`, and `PUBLIC_ORIGIN=https://<your assigned hostname>`. The application refuses production startup without an HTTPS origin and an explicit database path.
4. Configure `MIN_QUORUM=3`, `EVIDENCE_SECONDS=86400`, `VOTING_SECONDS=86400`, and `JURY_POLICY=account` for the documented account-based community court. These settings are copied into new cases. Setting `JURY_POLICY=nft` blocks voting until real verification is implemented. Choose shorter windows only for an explicitly labelled test environment.
5. Optionally set a secret `REGISTRATION_CODE` in the host dashboard to require an invitation. Never put the real code in GitHub or a browser bundle. Empty means open registration. Account-based voting is not Sybil-resistant, so invitation-controlled testing is preferable before broader public use.
6. For a Node service: build command `npm run build`, start command `npm start` from the checkout, health check `/api/health`. The build is a validated production copy into `dist/`; it does not change the runtime architecture. A host using that artifact can run `node server/index.mjs` inside `dist/` instead.
7. For Docker: build with `docker build -t chogcourt .`, mount the persistent volume at `/app/data`, supply the same environment variables, and terminate HTTPS at the hosting reverse proxy. The image runs as the non-root `node` user; the volume must be writable by that user. The Docker image has not been executed unless separately recorded in the delivery report.
8. Deploy, then complete the live verification below. Keep the hostname stable because the CSRF origin and Secure session cookies depend on it.

## Database and backups

The original migration is `server/migrations/001_initial.sql`; additive `002_daily_trials.sql` adds separate daily questions, choices, votes and results. Startup transactionally upgrades schema 1 to 2 without rewriting court tables or changing stored claim rules. Reopening schema 2 is idempotent; unsupported versions are rejected. WAL mode and foreign keys are enabled. Evidence bytes, hashes, cases, responses, votes, verdicts, sessions and history are stored in the same database. Back up a deployed database before a separately approved migration; this enhancement does not authorize running against production.

Configure host backups before inviting real users. Use SQLite's online backup API or stop the application while copying a consistent database; do not copy only the live main file and omit its WAL. Test restores in a separate environment. There is no automated backup scheduler, account recovery, content moderation, deletion workflow or malware scanning in this release.

## Live verification checklist

- Confirm `GET https://<host>/api/health` returns HTTP 200 and `ok:true`.
- Confirm the homepage is served by the Node backend (shared court label in the docket), not by a static-only host.
- Load all six gallery PNGs plus `/assets/images/chog-court-logo.png`; scroll through the full gallery and down to the footer. Check both themes, reload persistence, keyboard controls and enlarged artwork dialogs.
- Register two separate test accounts for plaintiff/defendant, file a case, submit evidence and a response, and mark both ready.
- In three other signed-in sessions, vote; check that both parties and repeat votes are rejected.
- Confirm the case has no verdict before the actual deadline. After the deadline, refresh and verify the final result, history and downloadable card.
- Reload and sign in on another browser to verify persistent records; restart the service and verify again.
- Confirm `/.env`, `/data/chogcourt.sqlite`, and `/server/app.mjs` are inaccessible.
- Keep NFT ownership and holder nominations labelled unavailable until the requirements in [BLOCKCHAIN.md](BLOCKCHAIN.md) are satisfied.

## Phone testing

Use the deployed HTTPS URL on your phone when available. For local testing only, bind `HOST=0.0.0.0`, set `PUBLIC_ORIGIN=http://<your computer LAN IP>:4173`, and open that same address from a phone on the same network. WSL may require Windows firewall/port-forwarding configuration. Do not expose the development HTTP server to the public internet. Verify portrait and landscape scrolling, full artwork visibility, modal close/focus behavior, and the primary case flow. Physical phones, Safari and Firefox require separate manual checks if unavailable to the automated runner.

## Environment values to configure

Use an ignored local `.env` (loaded by npm scripts) for local overrides, or the host's environment/secrets dashboard for production. `.env.example` contains defaults and placeholders only. No RPC API key, wallet key, database service token or token purchase is required for the current account-based court.

| Variable | Value / source | Required in production? |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS URL assigned by the selected host, without a path or trailing slash | Yes |
| `DATABASE_PATH` | Absolute SQLite filename on the host's persistent volume, e.g. `/app/data/chogcourt.sqlite` | Yes; disk persistence must be confirmed |
| `NODE_ENV` | `production` | Yes |
| `HOST` | `0.0.0.0` for host routing; `127.0.0.1` locally | Set for hosted routing |
| `PORT` | Port supplied by the host, or `4173` | Host-dependent |
| `JURY_POLICY` | `account` for usable non-wallet testing; `nft` deliberately disables voting until verification exists | Default `account` |
| `MIN_QUORUM` | Positive integer chosen by the court owner; default `3` | Default available |
| `EVIDENCE_SECONDS` | Evidence/response duration, default `86400` | Default available |
| `VOTING_SECONDS` | Voting duration, default `86400` | Default available |
| `REGISTRATION_CODE` | Optional private invitation code chosen by the owner; empty permits public registration | Optional; recommended for controlled testing |
| `MONAD_RPC_URL` | Server-only HTTPS RPC; defaults to the public `https://rpc.monad.xyz`, no key needed for basic use. Obtain a private URL from a provider only if necessary; keep it in host secrets | Optional; read-only diagnostic only |
| `NFT_COLLECTION_ADDRESS` | Reserved only: authoritative Chog NFT collection source still needed | Do not configure as trusted yet |
| `CHOG_MIN_BALANCE` | Reserved only: holder eligibility and selection policy must be supplied by the owner | Do not invent a threshold |

The last two variables do not enable any integration by themselves. Wallet connection and read-only contract compatibility diagnostics are implemented, but authenticated NFT ownership/balance gating remains unavailable. The owner-supplied NFT address conflicts with the official fungible-token reference; see [BLOCKCHAIN.md](BLOCKCHAIN.md). A compatible hosting target/account and its persistent-storage configuration must be supplied before deployment; none has been provisioned or purchased here.

## Daily Docket and local-only demonstration

Normal Daily Docket has no new environment variables: it uses one UTC date per question, a fixed quorum of 3 and the existing account authentication. It does not use or change `MIN_QUORUM`, `EVIDENCE_SECONDS`, `VOTING_SECONDS` or `JURY_POLICY` for claims. Phase transitions are request-driven, not a background job. No moderation, public-entry upload or notification system is included.

`npm run demo` runs `scripts/demo.mjs` without reading `.env`, binds `127.0.0.1:4174`, and creates a fresh temporary directory/database each time. Only a database object created by this dedicated temporary factory can enable short trials; supplying a regular SQLite path cannot opt in. The server rejects production mode, deployment/database environment settings, public origins, non-loopback bindings and nonmatching Host headers. The page and API label demo records. The demo is not copied into the production build (the `scripts/` directory is excluded).

Do not tunnel, publish or deploy the local demo. If it refuses inherited `DATABASE_PATH`, `PUBLIC_ORIGIN`, `HOST`, `PORT` or `NODE_ENV=production`, use a clean development shell rather than changing hosting settings. Temporary records are retained at the printed path after stopping; a subsequent run never resumes them. No fake users, questions or votes are seeded. Follow the timed four-account walkthrough in README.md.
