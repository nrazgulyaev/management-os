# FC-DEVELOPMENT-SALES — Sales

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/05-sales.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/05-sales.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Sales — `/development-os/sales` |
| **Pixel truth** | `cc-pixel-prompts/development/05-sales.md` |
| **Cross-surface partners** | Dev Contracts |
| **Tables** | `sales_pipeline_cards` · `stage_events` · `offers` |

## State machine — `sales card stage`

`lead` → `qualified` → `tour` → `contract` → `won` → `lost`

Offer policy: discount beyond a tier requires approval/escalation.

Store state on `sales card stage`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Sales pipeline | 6-stage FSM (lead→qualified→tour→contract→won/lost) | [core] | Have/verify |
| 2 | Contact/buyer detail | buyer record | [detail] | Build/verify |
| 3 | Offer policy + modal | offer with discount + approval | [cross] | Wire |
| 4 | Payment ladder | contract payment schedule |  | Have/verify |
| 5 | Funnel chart | stage conversion |  | Have/verify |
| 6 | Sales agents | offer-drafter · lead-scorer · pipeline-supervisor | [ai] | Build/verify |
| 7 | Pipeline-card storage | design wants sales_pipeline_cards/stage_events/offers | [design-only] | Build |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Offer policy + modal
- **Trigger:** offer with discount + approval (`/development-os/sales`)
- **Partner surface:** Dev Contracts
- **Event → effect:** an accepted offer becomes a contract group.

## Acceptance (behavioral)

- [ ] Only the listed `sales card stage` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Offer policy + modal: do the action on `/development-os/sales` → assert the effect on Dev Contracts with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
