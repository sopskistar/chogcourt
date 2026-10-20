# Deployment and operations

## Current hosting status

Repository inspection found no existing host configuration, no GitHub Pages site, no GitHub deployments, no existing Sites project, and no hosting/database credentials in the runtime environment. GitHub is the source repository, not a running backend. No public URL can be claimed until a deployment target is connected and the live checks below pass.

The implemented runtime is **Node.js 22.16+ with persistent SQLite**. It requires a continuously available writable persistent disk and a single application instance. It is not compatible with static-only GitHub Pages, ephemeral serverless filesystems, or the Sites/Cloudflare Worker runtime as-is. A Sites deployment would require a D1 storage adapter and platform authentication integration; do not upload this SQLite server there unchanged.

## Vercel decision and shortest reliable submission path

The finalization audit found no linked `.vercel/project.json`, `vercel.json`, remote database adapter or configured durable hosted database. GitHub authentication works; no GitHub deployment records or deployment checks were returned. No hosting change or deployment is authorized by this preparation step.

**Do not import this as a working Vercel application yet.** The backend uses synchronous `node:sqlite`, local WAL files and SQLite transactions. [Vercel explicitly documents that its functions do not provide shared permanent local SQLite storage](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel). Pointing `DATABASE_PATH` at `/tmp`, adding `DATABASE_URL`, or uploading `dist/` does not solve this: static HTML alone has no shared API, and the current code has no remote database adapter. Build/startup now refuse `VERCEL=1` to prevent a misleading or data-losing deployment.

The recommended zero-cost option is **alwaysdata Free, as a native Node.js website with SQLite on persistent account storage**. No Docker or external database is needed. This is an architecture/documentation assessment, not a tested hosting deployment: runtime, SQLite WAL/filesystem behavior, resource headroom and restart persistence must be checked on the actual account before submission. No account or paid resource has been provisioned. Do not expose or publish `npm run demo`.

If Vercel remains mandatory, stop at preparation: choose and approve a durable remote database, implement/test its asynchronous storage adapter and Vercel request handler, then configure credentials and deploy with separate approval. A Vercel proxy to a persistent Node backend is another possibility but still requires that backend host and tested same-origin cookies/CSRF routing. Neither option has been silently implemented; neither is an environment-only change.

## Free hosting comparison — checked 2026-10-20

The current storage boundary is `server/database.mjs` (`DatabaseSync`, WAL, synchronous transactions), with direct prepared SQL throughout `server/app.mjs`, `server/daily.mjs`, `server/rules.mjs` and `server/wallet-auth.mjs`. Evidence **bytes**, metadata, hashes, case records, votes, verdicts, accounts, sessions and NFT observations all live in SQLite. There is no remote database adapter and no `DATABASE_URL` consumer. The frontend and API are served together by `server/index.mjs`.

| Option | Current free offering and limits | Fit for this application |
| --- | --- | --- |
| Vercel Hobby | Ongoing personal/noncommercial tier; 100 GB transfer, 1 million function invocations, 4 active CPU-hours/month. Quota exhaustion can pause features until the usage window resets. Paid Pro is not needed for a qualifying small personal app, but does not solve SQLite persistence. [Hobby terms](https://vercel.com/docs/plans/hobby) | **Not deployable intact.** Static frontend can run, but local SQLite cannot be the shared durable backend. Existing build/start guards deliberately reject `VERCEL=1`. |
| Neon PostgreSQL, optionally connected through Vercel | Direct Free: no time limit/card; 1 GB storage and 100 CU-hours/month/project, 5 GB egress; idle compute scales down after 5 minutes. [Pricing](https://neon.com/pricing), [Vercel integration](https://neon.com/docs/guides/vercel-managed-integration) | Durable relational storage is suitable **after a migration**, not by just connecting it. Need async Postgres access, SQL/schema/blob conversion, transactional integrity tests and a Vercel-compatible handler. |
| Upstash Redis, optionally connected through Vercel | Account-owned Free: one DB, 500K commands/month, about 250 MB (table says 256 MB), 10 GB bandwidth. Adding a card upgrades to paid usage. [Pricing](https://upstash.com/pricing/redis) | Persistent, but **not SQLite/SQL**. Would require redesigning queries, foreign keys, uniqueness and atomic voting/finalization. Wrong choice for this deadline. |
| Supabase PostgreSQL, optionally connected through Vercel | Free: two active projects, 500 MB database/project, 1 GB object storage, 5 GB egress. Pauses after one inactive week; automatic backups excluded. Pro starts $25/month if those limitations are unacceptable. [Pricing](https://supabase.com/pricing), [integration](https://supabase.com/docs/guides/integrations/vercel-marketplace) | Can durably hold the data after the same substantial Postgres adapter/schema migration. Its separate object storage is not a mounted SQLite disk. Existing account auth need not be replaced. |
| **alwaysdata Free** | €0/month ongoing personal-use plan: 1 GB SSD, 256 MB RAM, ¼ CPU, three-day backups and an alwaysdata.net site address. The separate **Plus** plan has the 30-day trial and starts at €5/month excluding VAT. [Offers](https://www.alwaysdata.com/en/offers/) | **Smallest change: native Node + existing SQLite**, one instance. Adequacy for a small demo is an inference from the documented resources; host-side load/WAL/restart tests are still required. |

Upstash's [durability documentation](https://upstash.com/docs/redis/features/durability) says persistence is enabled, but free databases lack the extra redundancy of paid tiers; its [FAQ](https://upstash.com/docs/redis/help/faq) says inactive Free DBs can be archived after at least 30 days, with restore from backup. Do not use the anonymous three-day temporary database offer for a submission. Do not enable eviction for authoritative court data.

**Payment details:** Neon explicitly offers Free without a card. Supabase's [billing setup](https://supabase.com/docs/guides/platform/get-set-up-for-billing) requires cards for paid plans; Free is separate. Upstash Free does not require upgrading/adding a card. Vercel Hobby is a free rather than a paid subscription. These are not guarantees about every Marketplace checkout: choose an explicit $0 plan and review the integration's displayed terms before accepting anything. No checkout was performed here.

For alwaysdata, its [homepage](https://www.alwaysdata.com/en/) advertises registration without a card, but the [Free signup page](https://www.alwaysdata.com/en/register/?p=2012) currently includes **credit-card validation**. The [restricted-mode documentation](https://help.alwaysdata.com/en/docs/admin-billing/profile/restricted-mode/) also describes operation without a card under additional restrictions. Therefore **card-free activation cannot be promised**. Ask support whether your Free account can be activated without payment details if validation is mandatory; do not select Plus or pay to bypass it.

No listed database service automatically converts this code or provides a persistent filesystem to Vercel. For the deadline, do not migrate. If Free signup cannot be completed, the fallback is a local browser demonstration/screen recording using `npm run demo` (never publicly exposed), plus the GitHub source and honest hosting status.

## Recommended manual setup: alwaysdata Free

These are instructions for the owner, **not actions already performed**. Do not start a website, upload production data or change a running server until deployment is approved.

1. Select **Free (€0)** from the offers page, create your own account, and confirm the subscription is Free rather than a Plus trial. Keep credentials private. The existing public GitHub repo does not require a token to clone.
2. The provider documents [native Node.js HTTP websites](https://help.alwaysdata.com/en/docs/web-hosting/languages/nodejs/configuration/) and [SSH/SFTP on public hosting](https://help.alwaysdata.com/en/docs/admin-billing/billing/choose-its-paas/). Use **Web → Sites → Node.js**, not the separate paid-only background “Services” feature and not Docker. Select Node 22 in **Environment → Node.js**; confirm `node --version` is at least 22.16 and `node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; console.log(typeof DatabaseSync)"` prints `function`. A newer compatible Node 22 patch is preferable to changing the tested major version.
3. After deployment approval, clone `https://github.com/sopskistar/chogcourt.git` to `/home/<account>/chogcourt` using the SSH account shown in your dashboard. Run `npm run build` there. No npm installation is needed. Do not upload local `.env`, `data/`, test-browser profiles or temporary demo records.
4. In the Node website settings, use command `node /home/<account>/chogcourt/server/index.mjs` and working directory `/home/<account>/chogcourt`. Route the assigned alwaysdata.net hostname to that site. Set the environment values below; use the **assigned IP and port from the site configuration**, not guessed values. The same process serves frontend and `/api/*`; no separate frontend project, database credentials or CORS configuration is needed.
5. Store SQLite outside the checkout, e.g. `/home/<account>/chogcourt-data/court.sqlite`. Confirm this is writable **persistent account storage**, not `/tmp` or a backup mount; run a disposable SQLite WAL/read-write/reopen test there before real data. Keep one Node instance. The application creates the parent directory and applies additive migrations 001–003 on first start. Never point it at an existing database without a separately approved backup/upgrade.
6. Confirm HTTPS and the live verification checklist below before claiming success. In particular, create/read a test record, restart the service once with approval, and verify the record and evidence still exist. Check `node:sqlite` errors, memory, disk and RPC egress; 256 MB is a small budget and concurrent password hashing/uploads can exhaust it. Use an invitation code for a controlled hackathon audience.

Exact website environment values (replace placeholders using your dashboard; **do not paste placeholders literally**):

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://<assigned-hostname>.alwaysdata.net
HOST=<assigned-listening-IP>
PORT=<assigned-listening-port>
DATABASE_PATH=/home/<account>/chogcourt-data/court.sqlite
JURY_POLICY=account
MIN_QUORUM=3
EVIDENCE_SECONDS=86400
VOTING_SECONDS=86400
MONAD_RPC_URL=https://rpc.monad.xyz
REGISTRATION_CODE=<optional-private-invitation-code-or-empty>
```

No wallet key, seed phrase, RPC API key, Neon/Redis/Supabase credential or `DATABASE_URL` is required. The Genesis collection and chain 143 are fixed in code. Leave unused `NFT_COLLECTION_ADDRESS` and `CHOG_MIN_BALANCE` blank. Do not set local-demo flags or shorten the normal court windows.

Host file backups are [daily, with three days retained on Free](https://help.alwaysdata.com/en/docs/web-hosting/backups/). Keep a separately verified consistent SQLite backup before updates; a filesystem backup is not by itself proof that an active WAL database is recoverable. Monitor evidence/disk growth; the account's 1 GB is shared with code and logs. No SLA, load capacity, actual free-account signup or successful deployment was established by this audit.

### Source delivery and owner actions

1. Review `git status --short --branch` and the tested commits. Preserve Daily Docket commit `4756e86a696850a0f3cbdfc3a4e99cfd4ef16ce0`.
2. Verify `git remote get-url origin` is `https://github.com/sopskistar/chogcourt.git`, then `git fetch origin`. Push only if `origin/main` is an ancestor of local `main`: `git merge-base --is-ancestor origin/main main` followed by `git push origin main:main`. Never force. If authentication fails, run `gh auth login --hostname github.com` locally; do not paste a token into chat.
3. For the recommended host, follow **Recommended manual setup: alwaysdata Free** above. Confirm durable storage and the $0 plan before deployment; keep auto-deploy off until approved. Do not connect Vercel to `main` and expect this backend to run.
4. Configure the exact HTTPS `PUBLIC_ORIGIN`, persistent `DATABASE_PATH`, runtime values and optional invitation code in the host dashboard. For NFT identity reads the default public Monad RPC is sufficient for basic use; no key is required. `.env.example` is a template, not production secrets.
5. After explicit deployment approval, deploy once, run `/api/health` and the complete live checklist below, including persistence after restart. Until then there is **no verified live URL**. Local browser tests are not live deployment tests.

## Local use

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. There are no npm dependencies to install; the server-side signature library is vendored with its licenses. If another preview owns that port, stop that server first or select an unused port and matching `PUBLIC_ORIGIN` in `.env`. The server creates the SQLite file and applies migrations 001–003 as needed. `npm run db:migrate` also applies/checks the schema explicitly. Never commit `.env`, database files, or production evidence.

## Connect a Node/Docker host

1. Connect `sopskistar/chogcourt`, branch `main`, as a Node 22.16+ service or use the included `Dockerfile`.
2. Attach a **persistent** disk at `/app/data` (or the host's supplied mount path). Set `DATABASE_PATH` to `<persistent mount>/chogcourt.sqlite`. Keep one instance. Confirm the host's disk cost before provisioning; no paid resources have been provisioned by this task.
3. Set `HOST=0.0.0.0`, the host's `PORT`, `NODE_ENV=production`, and `PUBLIC_ORIGIN=https://<your assigned hostname>`. The application refuses production startup without an HTTPS origin and an explicit database path.
4. Configure `MIN_QUORUM=3`, `EVIDENCE_SECONDS=86400`, `VOTING_SECONDS=86400`, and `JURY_POLICY=account` for the documented account-based community court. These settings are copied into new cases. Setting `JURY_POLICY=nft` still blocks voting: authenticated NFT identity is implemented, but NFT jury gating is not. Choose shorter windows only for an explicitly labelled test environment.
5. Optionally set a secret `REGISTRATION_CODE` in the host dashboard to require an invitation. Never put the real code in GitHub or a browser bundle. Empty means open registration. Account-based voting is not Sybil-resistant, so invitation-controlled testing is preferable before broader public use.
6. For a Node service: build command `npm run build`, start command `npm start` from the checkout, health check `/api/health`. The build is a validated production copy into `dist/`; it does not change the runtime architecture. A host using that artifact can run `node server/index.mjs` inside `dist/` instead.
7. For Docker: build with `docker build -t chogcourt .`, mount the persistent volume at `/app/data`, supply the same environment variables, and terminate HTTPS at the hosting reverse proxy. The image runs as the non-root `node` user; the volume must be writable by that user. The Docker image has not been executed unless separately recorded in the delivery report.
8. Deploy, then complete the live verification below. Keep the hostname stable because the CSRF origin and Secure session cookies depend on it.

## Database and backups

The original migration is `server/migrations/001_initial.sql`; additive `002_daily_trials.sql` adds separate daily questions, choices, votes and results; `003_wallet_auth.sql` adds wallet challenges and session proofs. Startup transactionally applies missing migrations to schema 3 without rewriting court tables or changing stored claim rules. Reopening schema 3 is idempotent; unsupported versions are rejected. WAL mode and foreign keys are enabled. Evidence bytes, hashes, cases, responses, votes, verdicts, sessions and history are stored in the same database. Back up a deployed database before a separately approved migration; this enhancement does not authorize running against production.

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
- Follow the real-wallet walkthrough in [BLOCKCHAIN.md](BLOCKCHAIN.md): connection, explicit signature, live Genesis observation, token-specific identity, recheck and disconnect. A real browser wallet still requires manual testing. Keep NFT-gated voting and $CHOG nominations unavailable; identity verification does not enable them.

## Phone testing

Use the deployed HTTPS URL on your phone when available. For local testing only, bind `HOST=0.0.0.0`, set `PUBLIC_ORIGIN=http://<your computer LAN IP>:4173`, and open that same address from a phone on the same network. WSL may require Windows firewall/port-forwarding configuration. Do not expose the development HTTP server to the public internet. Verify portrait and landscape scrolling, full artwork visibility, modal close/focus behavior, and the primary case flow. Physical phones, Safari and Firefox require separate manual checks if unavailable to the automated runner.

## Environment values to configure

Use an ignored local `.env` (loaded by npm scripts) for local overrides, or the host's environment/secrets dashboard for production. `.env.example` contains defaults and placeholders only. No RPC API key, wallet key, database service token or token purchase is required for the current account-based court.

| Variable | Value / source | Required in production? |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS URL assigned by the selected host, without a path or trailing slash | Yes |
| `DATABASE_PATH` | Absolute SQLite filename on the host's persistent volume, e.g. `/app/data/chogcourt.sqlite` | Yes; disk persistence must be confirmed |
| `NODE_ENV` | `production` | Yes |
| `HOST` | Provider-assigned listening IP (alwaysdata), `0.0.0.0` for typical container routing; `127.0.0.1` locally | Set for hosted routing |
| `PORT` | Port supplied by the host, or `4173` | Host-dependent |
| `JURY_POLICY` | `account` for usable non-wallet testing; `nft` deliberately disables voting until NFT jury gating is implemented | Default `account` |
| `MIN_QUORUM` | Positive integer chosen by the court owner; default `3` | Default available |
| `EVIDENCE_SECONDS` | Evidence/response duration, default `86400` | Default available |
| `VOTING_SECONDS` | Voting duration, default `86400` | Default available |
| `REGISTRATION_CODE` | Optional private invitation code chosen by the owner; empty permits public registration | Optional; recommended for controlled testing |
| `MONAD_RPC_URL` | Server-only HTTPS RPC; defaults to the public `https://rpc.monad.xyz`, no key needed for basic use. Obtain a private URL from a provider only if necessary; keep it in host secrets | Optional; live NFT ownership reads |
| `NFT_COLLECTION_ADDRESS` | Reserved/unused; Genesis allowlist is fixed in `server/wallet.mjs` | Leave blank |
| `CHOG_MIN_BALANCE` | Reserved only: holder eligibility and selection policy must be supplied by the owner | Do not invent a threshold |

The last two variables do not enable any integration by themselves. Signed-wallet authentication and Chog Genesis ownership observations are implemented; NFT-gated voting and $CHOG nominations remain unavailable. The correct Genesis NFT is distinct from the earlier fungible-token reference; see [BLOCKCHAIN.md](BLOCKCHAIN.md). A compatible hosting account and its persistent-storage configuration must be supplied before deployment; none has been provisioned or purchased here.

## Daily Docket and local-only demonstration

Normal Daily Docket has no new environment variables: it uses one UTC date per question, a fixed quorum of 3 and the existing account authentication. It does not use or change `MIN_QUORUM`, `EVIDENCE_SECONDS`, `VOTING_SECONDS` or `JURY_POLICY` for claims. Phase transitions are request-driven, not a background job. No moderation, public-entry upload or notification system is included.

`npm run demo` runs `scripts/demo.mjs` without reading `.env`, binds `127.0.0.1:4174`, and creates a fresh temporary directory/database each time. Only a database object created by this dedicated temporary factory can enable short trials; supplying a regular SQLite path cannot opt in. The server rejects production mode, deployment/database environment settings, public origins, non-loopback bindings and nonmatching Host headers. The page and API label demo records. The demo is not copied into the production build (the `scripts/` directory is excluded).

Do not tunnel, publish or deploy the local demo. If it refuses inherited `DATABASE_PATH`, `PUBLIC_ORIGIN`, `HOST`, `PORT` or `NODE_ENV=production`, use a clean development shell rather than changing hosting settings. Temporary records are retained at the printed path after stopping; a subsequent run never resumes them. No fake users, questions or votes are seeded. Follow the timed four-account walkthrough in README.md.
