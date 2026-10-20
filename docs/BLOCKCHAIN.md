# Blockchain verification status

## Current implementation — 2026-10-20

**Chog Genesis** is now allowlisted at `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763` on Monad mainnet, chain ID **143**, RPC `https://rpc.monad.xyz`. The [official mint site](https://mint.chog.xyz/) links to [the collection](https://opensea.io/collection/chog-genesis); its [published configuration](https://mint.chog.xyz/_next/static/immutable/chunks/1ngh11k1abm9g.js) contains the same contract. The earlier `0x3500…7777` reference remains the fungible $CHOG token, never the NFT allowlist.

### What works and what does not

- Connect an injected EIP-1193 browser wallet; switch to Monad; explicitly sign a readable EIP-4361-format message using `personal_sign`. Server-side ethers 6.17.0 recovers the signer from the **server-stored** message, not a client-supplied message. Browser connection alone grants nothing.
- Challenges bind origin/domain, court account session, address, chain, optional token ID, random 192-bit nonce and five-minute expiration. Only one challenge is active per session. It is consumed before verification/RPC; replay, another session, changed message and wrong signer are rejected. No signature is stored. Wallet authentication lasts one hour in the current court session, not as a new passwordless account login.
- The server checks RPC chain ID, block reference, contract code, ERC-165/721, and `balanceOf(address)`. An optional decimal token ID additionally requires matching `ownerOf(tokenId)`. Reads use one block number and recheck its hash. Authentication is not an NFT claim unless reads succeed. Wrong network, timeouts, rate limits, malformed results and reverts fail closed.
- Successful token-specific observations populate the existing token-keyed identity storage and appear in Reputation. Key: network + collection + token ID. This is an **as-of-block observation**, not an immutable guarantee of present ownership. Recheck makes live reads; transfers remove the old session's verified identity. Historical token records remain historical; account votes/history are not retroactively assigned to the NFT.
- Disconnect, account/network changes, logout, or one-hour expiry invalidate wallet authentication. In-flight reads cannot recreate a disconnected session. Failed rechecks clear the current proof. If an offline browser cannot confirm revocation, it warns rather than claiming success; sign out/retry when online. Reload does not silently reconnect the extension; the server-side observation may remain in that court session until expiry/disconnect.
- **Court and Daily Docket remain account-based, ungated and unchanged.** NFT-only jury policy still fails closed. $CHOG nominations, token thresholds, QR/WalletConnect, smart-contract wallet/EIP-1271 signatures, NFT-gated court actions and live token reputation from court participation are not implemented. Do not claim NFT-essential jury mechanics are complete. This release provides an authenticated NFT identity, not NFT-powered voting.

No new contract, gas, transaction, transfer, staking, approval, private key, seed phrase, paid provider, or RPC API key is needed. `MONAD_RPC_URL` remains the optional existing server-only override. Collection and chain are fixed in code; reserved `.env.example` values do not override them. No hosting or production settings were changed. Migration 003 is additive and applies only when the updated server opens a database; this task's tests use temporary databases only.

### Manual real-wallet test (still required)

1. From a clean local development shell, run `npm run demo`. This uses a **fresh temporary database**, loopback only, and does not load `.env`. It also preserves normal Community Court deadlines. Open `http://127.0.0.1:4174/#account` in the browser containing your wallet extension. Do not tunnel/publish this demo.
2. Register/sign in to a court account. In **Chog Genesis identity**, click **Connect wallet**. Check the displayed address. Switch to Monad if asked; if the wallet has no Monad configuration, add chain 143 with the public RPC from [Monad's official docs](https://docs.monad.xyz/developer-essentials/network-information).
3. Leave token ID blank to check whether you hold any Chog Genesis NFT. For a token-keyed identity, enter the final numeric segment of your NFT's OpenSea item URL, **not necessarily the CHOG number printed on the artwork**.
4. Click **Sign & verify NFT**. Review the message: this local site's host, your wallet address, chain 143, expiration and a sign-in statement. Sign only that message. There should be **no transaction, spending approval or fee**. Reject anything unexpected.
5. A holder should see a signed-wallet status, observed balance, block and time; with a matching token ID, Reputation should show its token key separately from account activity. A nonholder should authenticate but see **no eligible NFT**, not a fabricated balance. You do not need to buy anything to test nonholder behavior or use the court.
6. Reject a signature once; switch accounts/networks; disconnect and reconnect. Each change must clear the prior authentication. Use **Recheck ownership** for a fresh observation. Sign again after changing the optional token ID. Court voting should still work without a wallet.

Automated signing uses unfunded disposable test keys and labelled RPC fixtures; it is **not a real extension test**. Real-network smoke results and exact automated runs are recorded in [TESTING.md](TESTING.md). A human must complete the extension/signing steps above before calling the wallet experience manually verified.

## Historical audit below — superseded by the implementation above

## Finalization check — 2026-10-19

The owner supplied `0x350035555e10d9afaf1566aaebfced5ba6c27777` as an NFT collection. **This reference is incompatible with the requested NFT role.** The [official site](https://www.chog.xyz/) publishes it as the **$CHOG token**; the supplied [OpenSea URL](https://opensea.io/token/monad/0x350035555e10d9afaf1566aaebfced5ba6c27777) is a fungible-token trading page, not an NFT collection page.

Actual unauthenticated HTTPS calls to `https://rpc.monad.xyz` returned HTTP 200: `eth_chainId` = `0x8f` (143), `eth_getCode` = 45 bytes, ERC-721 `supportsInterface(0x80ac58cd)` reverted, and `decimals()` = 18. These observations corroborate the mismatch; they do **not** establish ownership of any wallet. No holder address, signature or transaction was used. Public RPC access worked without a key for these checks; future availability/rate limits are not guaranteed. Monad documents public endpoints as suitable for basic use in its [network information](https://docs.monad.xyz/developer-essentials/network-information).

### What is now implemented

- Account screen: connect an existing injected EIP-1193 browser wallet, show its address/network, request a switch to Monad, and disconnect locally. Rejected requests, no provider, wrong network, account changes, network changes, empty accounts, disconnect events and stale requests are handled. There is no QR/WalletConnect integration or automatic reconnect after reload.
- `POST /api/wallet/inspect`: authenticated, CSRF-protected, rate-limited read-only **compatibility diagnostic**, not wallet authentication. Uses the fixed owner reference, verifies chain 143, records the observed block, checks contract code and ERC-165/ERC-721 interfaces. Fails closed on RPC/malformed/network errors. A fungible `balanceOf` response is never treated as NFT ownership. Even a successful interface check cannot override the official identity conflict.
- All diagnostic responses keep `ownershipVerified`, `walletAuthenticated`, `collectionTrusted` and `eligible` false. No wallet address, verified token or case association is written to SQLite. No eligibility is granted from client-supplied addresses. `JURY_POLICY=account`, claims, daily voting and court deadlines are unchanged.
- Browser automation uses a labelled injected provider and RPC fixtures. It is not a real-wallet test. See [TESTING.md](TESTING.md) for actual executed results.

### NFT-essential requirement: still blocked

The proposed meaningful role is an NFT-backed juror identity: one collection + token-ID identity per case, current-owner verification at voting, persistent history across transfers, and no self-voting. **This role is not enabled and the submission must not claim the NFT-essential requirement is met.** We need the correct official NFT collection contract and its authoritative collection page. Then implement domain-bound expiring single-use signature authentication, verify the supported NFT standard and `ownerOf(tokenId)` on Monad, and recheck ownership at every gated action. Existing account-based cases must keep their snapshotted policy. No new smart contract is needed for that off-chain role.

No token purchase, balance threshold, paid provider, private key, or API key is required to use the current safe connection/diagnostic. `MONAD_RPC_URL` is a server-only optional override; keep keyed provider URLs in the host secret store, never browser configuration. The browser receives only public chain ID 143 and the public contract reference. `NFT_COLLECTION_ADDRESS` and `CHOG_MIN_BALANCE` remain unused reserved placeholders; setting them does not enable gating. Holder nominations remain disabled.

## Earlier audit (historical context)

Checked against public sources on 2026-10-13. No wallet was connected, signature requested, transaction broadcast, or funds spent.

- The [official Chog website](https://www.chog.xyz/) explicitly publishes `$CHOG Contract Address` as `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777`. Its page source also contains that literal address. This corroborates the token identity; it does not verify any visitor's balance.
- [Monad's official current network facts](https://docs.monad.xyz/ai/current-facts) list Monad mainnet chain ID `143`, currency `MON`, and public RPC `https://rpc.monad.xyz`. This metadata is shown in the app, but no RPC balance or ownership query is currently performed.
- Searches found third-party Chog Genesis listings using `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`, for example [this OpenSea item](https://opensea.io/item/monad/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/1428). The official website and linked portal did not corroborate that candidate in their visible content or the inspected same-origin JavaScript bundles. The candidate is **not configured or trusted** in the application. Testnet collections and similarly named tokens are not treated as substitutes.

## Disabled integrations

The official NFT collection still needs authoritative confirmation. A supported wallet login flow still needs implementation and verification: domain-bound, expiring, single-use challenges; signature validation; session ownership; chain checks; and collection-allowlisted ownership reads with recorded block references. Current court accounts authenticate users to this application only.

`NFT_COLLECTION_ADDRESS` and `CHOG_MIN_BALANCE` in `.env.example` are reserved placeholders. Filling them does not enable verification. No balance threshold was invented. Nomination eligibility and the selection policy also need the owner's published rules. Until these requirements are met, NFT-only voting fails closed and nomination/wallet endpoints return an explicit unavailable response.

The database and key helper preserve token history by network + collection + token ID across owner changes. That plumbing is tested with labelled injected test proofs. It is not a substitute for real blockchain verification. Account reputation remains an account record and is never labelled as verified NFT reputation.

No transfers, staking, escrow, token approvals, private keys, seed phrases, or smart-contract deployments are involved in this application.
