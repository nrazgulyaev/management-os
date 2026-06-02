# FC-MANAGEMENT-UTILITIES — Utilities

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/18-utilities.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/18-utilities.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Utilities — `/dashboard/utilities` |
| **Pixel truth** | `cc-pixel-prompts/management/18-utilities.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | `utility_accounts` · `meter_readings` · `utility_payments` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Utility accounts | per-villa meters/accounts | [core] | Have/verify |
| 2 | Readings | append-only meter readings |  | Have/verify |
| 3 | Payments | utility payment scheduling |  | Have/verify |
| 4 | Risk feed | low-balance / overdue alerts |  | Have/verify |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- None blocking — verify each row against `main` before building.
