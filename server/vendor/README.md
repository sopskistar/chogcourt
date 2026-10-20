# Pinned signature verifier

`ethers-6.17.0.mjs` is the unmodified `dist/ethers.min.js` ESM distribution from ethers **6.17.0**, used server-side for EIP-191 signature recovery and checksum addresses. It is not sent to browsers. No RPC provider or wallet signing key is configured in the library.

Source: https://registry.npmjs.org/ethers/-/ethers-6.17.0.tgz

The downloaded archive was checked against npm's published SHA-512 integrity before extracting:
`sha512-BpyrpIPJ3ydEVow8zGaz1DuPS7YU8DcWxuBnY9a0UA/lvAPwrMr+EPXsfrul628SRaekPNeIM4UFh/91GWZang==`

Upstream MIT license is retained in `LICENSE-ethers.md`; bundled dependency notices are in `THIRD-PARTY-LICENSES.md`. Vendoring keeps the existing no-install startup and server-copy build/Docker packaging intact without changing hosting configuration. Review upstream security updates before upgrading; this is not an automatic update channel.
