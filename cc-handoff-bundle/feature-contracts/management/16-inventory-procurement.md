# FC-MANAGEMENT-INVENTORY-PROCUREMENT — Inventory & procurement

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/16-inventory-procurement.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/16-inventory-procurement.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Inventory & procurement — `/dashboard/inventory` |
| **Also covers** | procurement |
| **Pixel truth** | `cc-pixel-prompts/management/16-inventory-procurement.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | `stock_items` · `stock_movements` · `suppliers` · `purchase_orders` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Stock command | items, low-stock, stockout risk | [core] | Have/verify |
| 2 | Movements | stock in/out |  | Have/verify |
| 3 | Suppliers | registry |  | Have/verify |
| 4 | Purchase requests + orders | request → PO |  | Have/verify |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- None blocking — verify each row against `main` before building.
