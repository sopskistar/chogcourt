# Blockchain verification status

Checked against public sources on 2026-10-13. No wallet was connected, signature requested, transaction broadcast, or funds spent.

- The [official Chog website](https://www.chog.xyz/) explicitly publishes `$CHOG Contract Address` as `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777`. Its page source also contains that literal address. This corroborates the token identity; it does not verify any visitor's balance.
- [Monad's official current network facts](https://docs.monad.xyz/ai/current-facts) list Monad mainnet chain ID `143`, currency `MON`, and public RPC `https://rpc.monad.xyz`. This metadata is shown in the app, but no RPC balance or ownership query is currently performed.
- Searches found third-party Chog Genesis listings using `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`, for example [this OpenSea item](https://opensea.io/item/monad/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/1428). The official website and linked portal did not corroborate that candidate in their visible content or the inspected same-origin JavaScript bundles. The candidate is **not configured or trusted** in the application. Testnet collections and similarly named tokens are not treated as substitutes.

## Disabled integrations

The official NFT collection still needs authoritative confirmation. A supported wallet login flow still needs implementation and verification: domain-bound, expiring, single-use challenges; signature validation; session ownership; chain checks; and collection-allowlisted ownership reads with recorded block references. Current court accounts authenticate users to this application only.

`NFT_COLLECTION_ADDRESS` and `CHOG_MIN_BALANCE` in `.env.example` are reserved placeholders. Filling them does not enable verification. No balance threshold was invented. Nomination eligibility and the selection policy also need the owner's published rules. Until these requirements are met, NFT-only voting fails closed and nomination/wallet endpoints return an explicit unavailable response.

The database and key helper preserve token history by network + collection + token ID across owner changes. That plumbing is tested with labelled injected test proofs. It is not a substitute for real blockchain verification. Account reputation remains an account record and is never labelled as verified NFT reputation.

No transfers, staking, escrow, token approvals, private keys, seed phrases, or smart-contract deployments are involved in this application.
