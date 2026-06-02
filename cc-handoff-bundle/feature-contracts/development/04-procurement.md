# FC-DEVELOPMENT-PROCUREMENT — Procurement + Vendors

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/04-procurement.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/04-procurement.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Procurement + Vendors — `/development-os/procurement` |
| **Pixel truth** | `cc-pixel-prompts/development/04-procurement.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | `purchase_requests` · `quotations` · `vendor_scores` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Purchase requests | list + [code] + new | [core] | Have/verify |
| 2 | Quotation comparison matrix | [requestCode] + matrix island |  | Have/verify |
| 3 | Quotations + import | quote list + import wizard |  | Have/verify |
| 4 | Vendor scoring | reliability + lead-time | [ai] [design-only] | Build |
| 5 | Procurement analyst | supplier performance | [ai] | Build/verify |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
