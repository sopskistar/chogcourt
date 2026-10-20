# Chog Court

A court by Chog. A verdict by you.

The existing single-file vanilla frontend now connects to a persistent Node.js/SQLite court. The gallery shows complete illustrations at their natural aspect ratios, and the document scrolls through the courtroom, gallery and guide. The original mosaic, 14.6-second marquee, numerical crops, grain, fonts, entrance choreography and responsive modes remain intact.

## Run locally

Requires Node.js 22.16 or newer. No npm installation is needed. A pinned, vendored ethers signature verifier is included server-side with its license; the frontend remains vanilla and has no external libraries.

```sh
npm run dev
```

Open http://127.0.0.1:4173. The server creates `data/chogcourt.sqlite` and applies the versioned schema. Optional settings are documented in `.env.example`; copy desired settings into an untracked `.env`. Do not put secrets or databases in Git.

Restart `npm run dev` after backend changes; it does not watch server modules. Stop an older local process before starting dev on the same port. If `/api/health` reports schema 1 or 2 while this checkout expects 3, back up the database and restart the local backend; refreshing the browser alone cannot load new server routes. See [local troubleshooting](docs/DEPLOYMENT.md#local-feature-troubleshooting).

The old static preview still works with `python3 -m http.server 4173 --bind 127.0.0.1`, but it intentionally exposes only the separate local-practice frontend. Use the Node server for shared accounts and records.

## Daily Docket: one complete repeat-use loop

Discover a community question → review 2–4 fixed text choices → vote → return for the result → open the next question. This is a separate community poll, not a dispute or legal finding. Community Court and `/api/claims` retain their existing rules.

- Active signed-in accounts can submit questions; one queued question per author. Question/choices are immutable. No wallet or token is required.
- The oldest queued question opens on the first request for the current UTC date. An empty day can be filled immediately; it still closes at the next 00:00 UTC. Missed days are not backfilled.
- One non-editable vote per active, non-author account. Account identity does not establish unique people. Interim choice totals stay hidden.
- At least 3 votes are required. A unique highest count wins; tied leaders yield a tie; fewer than 3 votes yield insufficient participation. Refresh after closing to record the result and open the next queued question.
- Questions, choices, votes and results persist in SQLite. Reputation shows the latest 20 submitted/voted daily questions separately. Daily votes do not award court jury badges or increase its existing score.
- No automatic content generation, image uploads, open contestant entries, prizes, token rewards, or holder nominations. Moderation is not implemented: use controlled participants for the hackathon demo.

### Reliable local 60-second demo

```sh
npm run demo
```

Open **http://127.0.0.1:4174/#daily**. This is explicitly labelled LOCAL DEMO, binds only to loopback, rejects public Host headers, and always creates a fresh temporary SQLite database. It never loads `.env` or opens `data/chogcourt.sqlite`. Its separate session cookie does not replace your normal court login. Normal Daily Docket closes at UTC midnight; only this isolated demo uses a full 60 seconds from each opening. Community Court's evidence/voting defaults remain 24 hours even in the demo.

1. Before submitting, register four accounts (an author and three voters), using separate browser profiles/contexts. Multiple tabs or incognito windows in the same profile may share a login. Use passwords of at least 12 characters; no wallet is involved.
2. Open Daily Docket as the author. Expand **Submit the next question**, enter a question and at least two choices, then submit. The 60-second clock starts now.
3. Immediately submit a second question; it appears under **Up next**.
4. In each voter profile, open Daily Docket, select a choice, and click **Record my vote**. At least three different non-author accounts must vote before closing. Vote totals are real; nothing is prefilled.
5. After 60 seconds, click **Refresh · reveal result / open next docket**. See the first result under **Recent results** and the next question open above it. Refresh another profile to confirm shared records.
6. Open Reputation to see your daily history. Stop with Ctrl+C. The temporary path is printed; it remains available for inspection, but every new demo run starts fresh.

The demo refuses `NODE_ENV=production` or inherited `DATABASE_PATH`, `PUBLIC_ORIGIN`, `HOST`, or `PORT`. Use a clean development shell if refused; do not change deployment settings. Port 4174 must be free. No public demo deployment is provided or authorized.

## What works

- Shared accounts with salted scrypt passwords, HttpOnly sessions, CSRF protection, origin checks and server-side authorization. No wallet keys or seed phrases are requested.
- Shared case creation, retrieval, pagination, party identities and history. Defendants must have a different registered court account.
- Text/file evidence, server-calculated SHA-256 hashes, exact-byte downloads and per-case duplicate detection. Assigned defendants can respond.
- OPEN → EVIDENCE / RESPONSE → VOTING → FINALIZED. Real deadlines and both-party readiness govern progression; pending cases cannot produce final verdicts.
- Account-based jury eligibility, party exclusion and database-enforced duplicate-vote prevention. A unique plurality wins with quorum; ties and insufficient quorum yield NOT ENOUGH EVIDENCE.
- Animated verdicts, breakdowns, share links and SVG cards; accurate server-recorded participation, UTC streaks and badges; account reputation histories; activity-only Chaos Meter.
- Approved CHOG COURT emblem, “EVERY CHOG GETS A HEARING.” hero, single-row navigation, complete footer and community links.
- Court Light (default) and Chog Purple themes across the application; explicit theme choices persist when storage is available and work in-memory when it is blocked.
- Full-artwork galleries and individually enlarged illustrations, scrollable landing-page sections, accessible menu/dialog controls, and all existing local practice examples.
- Persistent records across separate users, browser sessions and server restarts. Shared data is never sourced from browser localStorage.

The default jury policy is explicitly **authenticated court accounts**, not verified NFT holders or one-human-one-vote. Multiple accounts remain a Sybil risk. Wallet identity verification does not change this policy. `JURY_POLICY=nft` still fails closed: NFT-gated voting has not been enabled.

## Wallet authentication and Chog Genesis identity

Open **Sign in / register → Chog Genesis identity**. Sign into a court account, connect an existing injected browser wallet, and switch to Monad mainnet (143). Connection alone is not authentication. Click **Sign & verify NFT** to approve a domain-bound, five-minute, single-use sign-in message. No transaction, approval, token purchase, seed phrase or private key is requested. Authentication lasts one hour in that court session; disconnect, account/network changes and court logout revoke it.

The allowlisted NFT is **Chog Genesis**, `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`, linked by [Chog's official mint site](https://mint.chog.xyz/) to [OpenSea](https://opensea.io/collection/chog-genesis). The older `0x3500…7777` address is the fungible $CHOG token and is not used for NFT checks. The server reads ERC-721 support and `balanceOf` via the public Monad RPC; an optional token ID additionally checks `ownerOf` and saves a token-keyed identity observation. RPC errors never count as ownership. No API key is required for basic public-RPC use.

For a specific identity, enter the on-chain token ID from the OpenSea URL (not the artwork's displayed name), then sign. Reputation displays that session's observed identity separately from account scores/history. **Recheck ownership** makes new live reads; a transfer can invalidate a prior observation. Account activity is not retroactively assigned to the NFT. Smart-contract wallet signatures, WalletConnect/QR, NFT-gated voting and holder nominations are not implemented. The NFT-backed identity works independently of voting; do not claim NFT-essential jury mechanics are complete. Full manual test steps: [BLOCKCHAIN.md](docs/BLOCKCHAIN.md).

## What is not enabled

The $CHOG token-balance requirement and nomination selection policy remain unconfigured. Chog Genesis NFT verification does not establish $CHOG token eligibility. The nomination UI and API still reject unavailable holder actions. No featured winner or eligibility threshold is invented.

NFT identity storage uses network + collection address + token ID, with the last observed owner stored separately. Only server-verified signed sessions and RPC reads can create an identity observation. Existing claims and votes are not linked to that NFT; current-owner checks at gated court actions remain future work.

Password recovery, email verification, content moderation, malware scanning and automated backups are not implemented. Evidence is public; do not upload private information. Community court findings are not legal judgments.

## Court rules and persistence

Default evidence/response and voting windows are each 24 hours; quorum is 3. Rules are copied into each case. Both parties may close evidence early; one party cannot silence the other. Deadlines advance during server requests, including after idle periods. Votes and final findings are immutable through the public API.

Shared achievements: First Vote = 1 accepted vote; Consistent Juror = votes on 5 cases; Jury Streak = 3 consecutive UTC dates. Current streaks end today or yesterday; longest-run badges remain earned after a gap. Score = `min(100, 10 × accepted votes + 5 × distinct cases with submitted evidence)`. Allegations and outcomes do not alter the score.

Shared Chaos = `min(100, 8 × min(5, evidence items) + 4 × min(15, eligible account votes))`. Low Chaos is 0–24, Court Is Heating Up 25–59, Maximum Chaos 60–100. It measures activity only and never affects verdicts.

The “Local practice examples” button keeps the previous browser-only frontend available, visibly separate from the shared court. Existing `chog-court.v1` records remain untouched. Demo cases/votes never earn shared achievements. Old undated practice votes do not gain invented streaks, and local drafts are not real holder nominations.

## Architecture and API

- Frontend: `index.html`, inline CSS/JavaScript/SVG; embedded Archivo/Inter WOFF2 and OFL license.
- Backend: built-in Node HTTP, crypto and SQLite modules, plus the pinned server-side ethers signature verifier.
- Database: SQLite with WAL, foreign keys, transactional migrations/finalization, immutable history and uniqueness constraints.
- Production: one Node/Docker instance and a persistent disk. Static-only or ephemeral serverless hosting is unsuitable without a database/runtime adapter. Schema 002 adds daily tables; schema 003 adds wallet-session/challenge tables without changing existing court tables or rules. Back up any deployed database before a separately approved upgrade. No hosting or production settings were changed by the wallet implementation.
- Full endpoint contract: [docs/API.md](docs/API.md).
- Hosting setup, migrations, backup requirements and phone testing: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The provided build is a validated production artifact copy, not a frontend framework build:

```sh
npm run db:migrate
npm run build
npm start
```

No hosting target was configured in the repository or available environment. No deployment should be reported successful without a verified live URL and API health check.

## Artwork

All six unmodified PNGs in `assets/images/` came from the repository's main branch at [e0ece21](https://github.com/sopskistar/chogcourt/tree/e0ece210a11acb5c6ef6c4dc31e6deb337310c5c): `verdict-machine.png`, `jury-streaks-daily-docket.png`, `chog-reputation-card.png`, `chog-case-of-the-day.png`, `chog-court-judge.png`, and `chog-official-pfp.png`. Root originals remain preserved. Feature posters are labelled concept artwork, not live data.

The transparent 1254×1254 `Chibi Purple Court Emblem.png` was retrieved from the logo-only main-branch commit [5e84aab](https://github.com/sopskistar/chogcourt/commit/5e84aab) by a safe fast-forward, then copied byte-for-byte to `assets/images/chog-court-logo.png`. That same unmodified PNG is used in the header, footer and favicon. No replacement logo was generated. See [brand tokens and theme behavior](docs/BRANDING.md).

## Tests

```sh
npm test
npm run test:frontend
npm run test:browser
npm run build
```

Backend tests exercise authentication, authorization, cases, evidence bytes/hashes/duplicates, responses, phase transitions, voting, verdict rules, persistence, activity calculations, unavailable integrations and transfer-stable token keys. The last use injected test proofs, not real blockchain ownership.

Browser suites use an installed Chromium with isolated contexts and temporary databases. Set `CHOG_BROWSER_PATH` if autodiscovery does not find it. Reports, screenshots and exports are written to a printed temporary directory outside the repository. Existing tests cover 21 viewport/device configurations. The shared journey explicitly covers 1440×900, 1280×800, 768×1024, 1024×768, 390×844, 360×800 and 844×390, multi-user forms, actual API calls, persistence, scrolling, complete image sizing, primary navigation, error states and API outages.

Firefox, WebKit and physical devices were unavailable in this environment; they are not claimed as tested. The Dockerfile is provided but not claimed as built or run. Refer to the delivery report for the actual completed test counts and final deployment status.

The [validation record](docs/TESTING.md) documents actual results, investigated failures, tested viewports, local smoke checks and the exact changed-file manifest.

Built by @sopskistar
