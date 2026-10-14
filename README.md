# Chog Court

A court by Chog. A verdict by you.

The existing single-file vanilla frontend now connects to a persistent Node.js/SQLite court. The gallery shows complete illustrations at their natural aspect ratios, and the document scrolls through the courtroom, gallery and guide. The original mosaic, 14.6-second marquee, numerical crops, grain, fonts, entrance choreography and responsive modes remain intact.

## Run locally

Requires Node.js 22.16 or newer. No third-party runtime dependencies or npm installation are needed.

```sh
npm run dev
```

Open http://127.0.0.1:4173. The server creates `data/chogcourt.sqlite` and applies the versioned schema. Optional settings are documented in `.env.example`; copy desired settings into an untracked `.env`. Do not put secrets or databases in Git.

The old static preview still works with `python3 -m http.server 4173 --bind 127.0.0.1`, but it intentionally exposes only the separate local-practice frontend. Use the Node server for shared accounts and records.

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

The default jury policy is explicitly **authenticated court accounts**, not verified NFT holders or one-human-one-vote. Multiple accounts remain a Sybil risk. For controlled testing, configure `REGISTRATION_CODE`. Set `JURY_POLICY=nft` only if you want voting to fail closed while NFT verification is unavailable.

## What is not enabled

The official Chog website corroborates the $CHOG token address, and Monad's official docs corroborate mainnet chain ID 143. The NFT collection was not independently corroborated from an authoritative Chog source. Wallet authentication, NFT ownership, token balances, a holder balance threshold, and nomination selection policy remain unconfigured. The nomination UI and API clearly reject unavailable holder actions. No featured winner, ownership claim or blockchain confirmation is fabricated.

NFT history storage uses network + collection address + token ID, with the current owner stored separately. Transfer-stable association is tested using labelled injected proofs only. No public endpoint can create a verified NFT record from a client assertion. Real blockchain verification is still required before linking real cases to NFTs. See [blockchain verification](docs/BLOCKCHAIN.md).

Password recovery, email verification, content moderation, malware scanning and automated backups are not implemented. Evidence is public; do not upload private information. Community court findings are not legal judgments.

## Court rules and persistence

Default evidence/response and voting windows are each 24 hours; quorum is 3. Rules are copied into each case. Both parties may close evidence early; one party cannot silence the other. Deadlines advance during server requests, including after idle periods. Votes and final findings are immutable through the public API.

Shared achievements: First Vote = 1 accepted vote; Consistent Juror = votes on 5 cases; Jury Streak = 3 consecutive UTC dates. Current streaks end today or yesterday; longest-run badges remain earned after a gap. Score = `min(100, 10 × accepted votes + 5 × distinct cases with submitted evidence)`. Allegations and outcomes do not alter the score.

Shared Chaos = `min(100, 8 × min(5, evidence items) + 4 × min(15, eligible account votes))`. Low Chaos is 0–24, Court Is Heating Up 25–59, Maximum Chaos 60–100. It measures activity only and never affects verdicts.

The “Local practice examples” button keeps the previous browser-only frontend available, visibly separate from the shared court. Existing `chog-court.v1` records remain untouched. Demo cases/votes never earn shared achievements. Old undated practice votes do not gain invented streaks, and local drafts are not real holder nominations.

## Architecture and API

- Frontend: `index.html`, inline CSS/JavaScript/SVG; embedded Archivo/Inter WOFF2 and OFL license.
- Backend: built-in Node HTTP, crypto and SQLite modules; no external runtime library.
- Database: SQLite with WAL, foreign keys, transactional migrations/finalization, immutable history and uniqueness constraints.
- Production: one Node/Docker instance and a persistent disk. Static-only or ephemeral serverless hosting is unsuitable without a database/runtime adapter.
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
