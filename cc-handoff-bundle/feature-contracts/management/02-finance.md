# FC-MANAGEMENT-FINANCE — Finance / Statements (Mgmt side)

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/02-finance.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/02-finance.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Finance / Statements (Mgmt side) — `/dashboard/finance` |
| **Pixel truth** | `cc-pixel-prompts/management/02-finance.md` |
| **Cross-surface partners** | Owner Portal · Operations |
| **Tables** | `owner_statements` · `statement_line_items` · `statement_anomalies` · `reserves` · `payouts` · `accounting_periods` |

## State machine — `owner_statements.owner_status`

`pending` → `viewed` → `awaiting` → `acknowledged` → `auto_acked` → `disputed` → `resolved` → `revised`

This is the **builder/source** side of the owner statement lifecycle. Full state machine + math contract: see `owner/02-statements.md`.

Store state on `owner_statements.owner_status`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Finance home | KPIs + period overview | [core] | Have/verify |
| 2 | Owner statements list | per-owner monthly statements + `owner_status` column | [core] | Have/verify |
| 3 | Statement detail / builder | line items each tagged with one of 6 categories (revenue/fees/taxes/expenses/management/reserve) | [detail] | Build/verify |
| 4 | Statement PDF | pdf route generation |  | Have/verify |
| 5 | Statement transparency | owner-safe source-group buckets | [cross] | Wire |
| 6 | Reconciliation warnings | info/warn/critical layer + open-row dedupe |  | Have/verify |
| 7 | Expenses | list + new → posts categorised expense/mgmt-fee/reserve/tax lines | [cross] | Wire |
| 8 | Fees | management / cleaning fees |  | Have/verify |
| 9 | Material-usage bridge | ops material usage → statement lines | [cross] | Wire |
| 10 | Payouts | payout runs + new |  | Have/verify |
| 11 | Periods | accounting periods + close |  | Have/verify |
| 12 | Reserves | reserve balances + ledger |  | Have/verify |
| 13 | Revenue | revenue entries | [cross] | Wire |
| 14 | Taxes | tax records |  | Have/verify |
| 15 | Statement anomalies | anomaly detector flags (supplier spike, occupancy drop) | [ai] | Build/verify |
| 16 | Receive owner action | viewed / acked / disputed update the list | [cross] | Wire |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Statement transparency
- **Trigger:** owner-safe source-group buckets (`/dashboard/finance`)
- **Partner surface:** Owner Portal
- **Event → effect:** recompute owner-facing explanation.

### Expenses
- **Trigger:** list + new → posts categorised expense/mgmt-fee/reserve/tax lines (`/dashboard/finance`)
- **Partner surface:** Owner Portal
- **Event → effect:** admin recording an expense splits into the 6 categories that surface in the owner statement.

### Material-usage bridge
- **Trigger:** ops material usage → statement lines (`/dashboard/finance`)
- **Partner surface:** Operations
- **Event → effect:** completed material usage posts an expense line.

### Revenue
- **Trigger:** revenue entries (`/dashboard/finance`)
- **Partner surface:** Owner Portal
- **Event → effect:** emit `finance.revenue` → partner subscribes and reflects the change with no manual sync.

### Receive owner action
- **Trigger:** viewed / acked / disputed update the list (`/dashboard/finance`)
- **Partner surface:** Owner Portal
- **Event → effect:** subscribe to owner events; dispute opens a Mgmt Inbox thread → Director, pauses payout, exposes Resolve→Revise.

## Acceptance (behavioral)

- [ ] Only the listed `owner_statements.owner_status` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Statement transparency: do the action on `/dashboard/finance` → assert the effect on Owner Portal with no manual refresh.
- [ ] Expenses: do the action on `/dashboard/finance` → assert the effect on Owner Portal with no manual refresh.
- [ ] Material-usage bridge: do the action on `/dashboard/finance` → assert the effect on Operations with no manual refresh.
- [ ] Revenue: do the action on `/dashboard/finance` → assert the effect on Owner Portal with no manual refresh.
- [ ] Receive owner action: do the action on `/dashboard/finance` → assert the effect on Owner Portal with no manual refresh.
- [ ] Recording an expense in admin produces categorised lines that reconcile to the owner statement net.
- [ ] A disputed owner statement appears here as `disputed` and as a Director-assigned Inbox thread.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
