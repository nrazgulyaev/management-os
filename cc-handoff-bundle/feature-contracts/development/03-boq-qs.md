# FC-DEVELOPMENT-BOQ — BOQ + QS

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/03-boq-qs.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/03-boq-qs.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | BOQ + QS — `/development-os/boq` |
| **Pixel truth** | `cc-pixel-prompts/development/03-boq-qs.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | `boq` · `boq_revisions` · `boq_actuals` · `variance_reviews` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | BOQ list | bills of quantities | [core] | Have/verify |
| 2 | BOQ detail [code] | line items, virtualized | [detail] | Build/verify |
| 3 | Variance pills | qty Δ + rate Δ | [design-only] | Build |
| 4 | QS variance review | review workspace |  | Have/verify |
| 5 | Import wizard | 3-step BOQ import + quick-entry |  | Have/verify |
| 6 | Export | BOQ export |  | Have/verify |
| 7 | QS cost analyst | overrun + forecast-at-completion | [ai] | Build/verify |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
