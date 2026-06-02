# FC-DEVELOPMENT-DEV-FINANCE — Cluster · Dev Finance

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/08-cluster-dev-finance.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/08-cluster-dev-finance.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Dev Finance — `/development-os/cfo/cashflow` |
| **Also covers** | profitability · banking |
| **Pixel truth** | `cc-pixel-prompts/development/08-cluster-dev-finance.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | `cashflow_forecast` · `bank_connections` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Cashflow 12-mo forecast | net + cumulative, capital-call spike, reserve breach | [core] | Have/verify |
| 2 | Cashflow-forecaster agent | live series from BOQ + capital calls | [ai] [design-only] | Build |
| 3 | Unit profitability table | cost basis + expected margin + margin% (GENERATED STORED) | [core] | Have/verify |
| 4 | Margin tone badges | ≥25 / ≥10 / ≥0 / negative |  | Have/verify |
| 5 | Bank connections | Revolut/Wise (API) · Mandiri/BCA/manual (CSV) |  | Have/verify |
| 6 | Bank detail + sync status | [id] last-sync result |  | Have/verify |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
