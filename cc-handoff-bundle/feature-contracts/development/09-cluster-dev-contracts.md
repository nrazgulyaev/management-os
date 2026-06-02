# FC-DEVELOPMENT-DEV-CONTRACTS — Cluster · Dev Contracts

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/09-cluster-dev-contracts.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/09-cluster-dev-contracts.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Dev Contracts — `/development-os/contracts` |
| **Also covers** | invoices · discounts · commitments |
| **Pixel truth** | `cc-pixel-prompts/development/09-cluster-dev-contracts.md` |
| **Cross-surface partners** | CFO · Investors |
| **Tables** | `contracts` · `invoices` · `discount_approvals` · `commitments` |

## State machine — `contract group`

`draft` → `pending` → `partial` → `fully_signed` → `payment` → `completed`

Invoice status: draft/sent/viewed/paid/overdue/void. Discount approval = role-tier authority + auto-escalation.

Store state on `contract group`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Contract groups | per buyer-villa; 3 child contracts off-plan | [core] | Have/verify |
| 2 | Group status FSM | draft→pending→partial→fully-signed→payment→completed |  | Have/verify |
| 3 | Milestone invoices | issued on pre-invoice/due triggers | [cross] | Wire |
| 4 | Invoice status | draft/sent/viewed/paid/overdue/void |  | Have/verify |
| 5 | Discount approval ladder | role-tier authority + auto-escalation | [core] | Have/verify |
| 6 | Authorization tiers | per-role max % + escalate-to |  | Have/verify |
| 7 | Capital commitments | per investor×project, profit % + priority | [cross] | Wire |
| 8 | Drawdowns + wallets | commitment [id] | [detail] | Build/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Milestone invoices
- **Trigger:** issued on pre-invoice/due triggers (`/development-os/contracts`)
- **Partner surface:** CFO
- **Event → effect:** milestone trigger issues an invoice.

### Capital commitments
- **Trigger:** per investor×project, profit % + priority (`/development-os/contracts`)
- **Partner surface:** Investors
- **Event → effect:** emit `dev-contracts.capital_commitments` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] Only the listed `contract group` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Milestone invoices: do the action on `/development-os/contracts` → assert the effect on CFO with no manual refresh.
- [ ] Capital commitments: do the action on `/development-os/contracts` → assert the effect on Investors with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
