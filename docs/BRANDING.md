# Brand and theme system

The approved identity is CHOG COURT. Tagline: **A court by Chog. A verdict by you.** Hero: **EVERY CHOG GETS A HEARING.** Credit: **Built by @sopskistar**.

The original uploaded emblem is preserved, including its alpha channel, at `assets/images/chog-court-logo.png`. Header/footer sizing uses contain and never filters or recolors the art. The same PNG is the favicon; no unrelated replacement glyph is used. Judge and official PFP remain separate character illustrations. Six gallery images retain their native 1:1 or 3:2 proportions; all six enlarge into independently scrollable, keyboard-accessible dialogs. Printed scores, names, token identities, eligibility and verdicts in the four feature illustrations are examples, not application records.

## Semantic CSS tokens

The restrained purple was chosen by inspecting the official PFP's purple body; gold follows the uploaded emblem's crown and frame. These are artwork-inspired interface colors, not a claim of a published official color specification.

| Role | Court Light | Chog Purple |
| --- | --- | --- |
| `--paper` | `#f5f4ef` | `#241342` |
| `--surface` | `#fffdf8` | `#322050` |
| `--surface-raised` | `#ffffff` | `#3b285b` |
| `--ink` | `#211b2c` | `#fff8e9` |
| `--muted` | `#625970` | `#d4c8e2` |
| `--border` | `#d4ccd9` | `#806996` |
| `--accent` | Purple `#34206c` | Gold `#f4c661` |
| `--accent-ink` | `#ffffff` | `#28173d` |
| `--focus` | `#6836b4` | `#ffdf8a` |
| `--highlight` / ink | `#f7e6b6` / `#342342` | `#49335f` / `#fff2cf` |
| Danger / success / warning | `#a62c29` / `#20634d` / `#735009` | `#ffaaa1` / `#a0e2be` / `#f4d37c` |

Header and court tokens alias this palette. Mosaic coral, yellow, blue, cream and dark tiles remain independent; original grain, numerical image crops, 14.6-second alternating loops and entrance timing are unchanged. Exported SVG court records deliberately retain a consistent light-paper printable design.

## Theme behavior

Court Light is the initial default, irrespective of system theme. The accessible navigation toggle names the theme it will activate. The explicit choice is saved under `chog-court.theme` and read before paint; storage exceptions are caught and the current-session toggle still works. System dark mode does not override an explicit choice. No transition was added to artwork or marquee timing. The toggle is available in the single header at all responsive sizes (an icon-only control with an accessible name on narrow screens).

The footer uses only the six supplied community URLs, with `noopener noreferrer` for new tabs. HTTP checks reached all six with status 200 on 2026-10-13 (two transient fetch failures succeeded on retry); GitHub API also corroborated the creator account and project. An HTTP response from X or Discord does not establish that every sign-in-gated interaction works. No social account was accessed or modified.
