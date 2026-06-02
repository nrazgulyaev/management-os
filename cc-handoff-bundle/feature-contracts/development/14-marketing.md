# FC-DEVELOPMENT-MARKETING — Dev marketing

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/14-marketing.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/14-marketing.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Dev marketing — `/development-os/marketing` |
| **Pixel truth** | `cc-pixel-prompts/development/14-marketing.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | see migration / data-wiring prompt |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Marketing pipeline | see cluster Dev Ops (C9) for the full inventory | [core] | Have/verify |
| 2 | Campaign + content | channels, attribution, approval queue |  | Have/verify |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- This overlaps cluster `11-cluster-dev-ops.md` — build marketing there; this file is the standalone-cabinet pointer.
