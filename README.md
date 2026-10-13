# Chog Court

Single-file vanilla JavaScript frontend. The application lives in `index.html`, with inline styles, SVG icons, embedded Archivo/Inter fonts and their license notices. Images are served from `assets/images/`. There is no build step, package installation, external JavaScript/CSS library, backend or wallet connection.

## Run locally

From the project directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173`. Use HTTP instead of opening the file directly so the verdict-card export can embed its local mascot image.

The viewport-locked homepage retains the original three-column staggered mosaic, optional wide-screen columns, 14.6-second alternating CSS marquees, crop positions, grain, entrance handoff, responsive modes and reduced-motion behavior. Application dialogs can scroll independently. The Menu and the docket's feature navigation provide access to the new screens.

## Features and data boundaries

- **Verdict Machine:** animated stamps, party aliases, case/category details, vote totals and percentages, an SVG download with embedded mascot/font, and a copyable summary with an exact-case link. Three immutable, labelled finalized examples demonstrate GUILTY, INNOCENT and NOT ENOUGH EVIDENCE. Pending or unavailable cases never produce final results or exports. Local votes cannot finalize a case.
- **Daily Docket:** case/category search, hearing status, practice participation, honest deadline placeholders, UTC jury streaks and earned practice badges. No illustrated counts or sample votes count toward achievements.
- **Reputation Cards:** a local practice profile and fictional demo identities, case roles/history, final demo outcomes and a documented participation score. Accusations remain pending allegations. NFT identity, token ID and ownership are explicitly unavailable until verified.
- **$CHOG Case of the Day:** a labelled daily demo rotation and a working local nomination-draft form. Network, token contract and eligibility policy are unconfigured; no balance threshold is assumed and no balance is checked. Drafts are off-chain browser records, not accepted holder nominations or transactions. No transfers, staking, escrow, signatures, approvals or payments occur.
- **Chaos Meter:** local evidence notes update a documented activity score. Activity never determines truth, guilt, reputation or a verdict. Verified eligible jury participation contributes zero until verification exists.

The existing case filing, one-vote-per-case practice flow, gallery, search, information screens, accessible menu and dialogs remain available. All six original images appear in the gallery; feature posters are supporting concept art, never data or replacement interfaces.

### Transparent calculations

A qualifying practice vote is a new, dated vote on a locally filed, non-demo case. Each case counts once. Demo votes and legacy votes without timestamps are excluded. These records are editable browser data, not verified jury activity.

- **First Vote:** one qualifying vote.
- **Consistent Juror:** votes on five distinct qualifying cases.
- **Jury Streak:** three consecutive active UTC dates, based on the longest run. Several votes on one date count as one day. The current streak is a run ending today or yesterday; an older last active date resets the current streak. An earned badge remains earned after a gap.
- **Practice reputation:** `min(100, 10 × qualifying votes + 5 × distinct local cases with a qualifying evidence note)`. Notes require at least 20 characters after trimming. Multiple notes on the same case do not multiply its reputation contribution. Case outcomes and accusations do not affect the score.
- **Chaos:** `min(100, 8 × min(5, local evidence notes) + 4 × min(15, verified eligible jurors))`. Low Chaos is 0–24, Court Is Heating Up is 25–59, and Maximum Chaos is 60–100. With jury verification unavailable, only the evidence component is active; the preview cannot reach Maximum Chaos through fabricated participation.

### Persistence and future identity integration

Storage remains under `chog-court.v1`; schema version 2 adds dated vote events, evidence notes and nomination drafts. Existing cases and yes/no votes are retained. Migration does not invent dates or grant retroactive streaks. Storage failures are reported, and changes then last only for the current visit. A separate tab's changes trigger a reload notice.

`window.ChogCourt` exposes the calculation helpers and the frozen, unconfigured `CHAIN_CONFIG` for inspection. The EVM NFT key helper derives `eip155:<chainId>:erc721:<collectionAddress>/<tokenId>`, normalizing the address and decimal token ID. This is key derivation only, not collection or ownership verification. A future verified token record must use that key, store the current owner separately, and preserve history across transfers. The local practice profile is not assigned an invented NFT key.

The backend phase still needs durable/shared case records, authenticated eligible voting, evidence validation, real deadlines and finalization rules, verified NFT collection/token/ownership records, trusted $CHOG network/contract and eligibility configuration, balance verification, and a published nomination/selection policy. No backend work or deployment is included here.

## Artwork provenance

All six PNGs were retrieved directly from the existing repository's `main` branch, commit [`e0ece210a11acb5c6ef6c4dc31e6deb337310c5c`](https://github.com/sopskistar/chogcourt/tree/e0ece210a11acb5c6ef6c4dc31e6deb337310c5c), using a safe fetch and extraction of only the named assets. No pull, reset or replacement of the existing frontend was performed.

- `assets/images/verdict-machine.png`
- `assets/images/jury-streaks-daily-docket.png`
- `assets/images/chog-reputation-card.png`
- `assets/images/chog-case-of-the-day.png`
- `assets/images/chog-court-judge.png` — primary judge mascot; mosaic and verdict cards.
- `assets/images/chog-official-pfp.png` — official identity artwork; mosaic and identity cards.

The PNGs are unmodified originals. Claims printed inside the feature illustrations are explicitly labelled as concept art, not live counts, dates, identity verification or eligibility.

## Browser regression checks

Requires Node.js 22+ and an already installed Chromium/Chrome. No npm dependencies are needed:

```sh
node tests/frontend.mjs
```

The script discovers common Chromium paths, including a Playwright Chromium cache. To choose another installed browser:

```sh
CHOG_BROWSER_PATH=/absolute/path/to/chromium node tests/frontend.mjs
```

Checks use an isolated browser context and a temporary loopback server; they do not change your browser's saved court records. Screenshots, the actual downloaded SVG card and a JSON report are written to a printed temporary directory outside the repository. A restricted environment must allow loopback sockets and a headless browser process.

Coverage includes 20 viewport/device configurations, all five layout modes, entrance/marquee continuity, image decoding, feature overflow, all three demo verdicts, pending-result guards, SVG download/decoding, clipboard fallback, real local practice actions, UTC streak rules, evidence/chaos calculations, NFT key stability, nomination acknowledgments, persistence/migration, search/filtering, keyboard navigation, reduced motion and storage failure. These are Chromium checks; real-device Safari/Firefox and assistive-technology testing are not included.
