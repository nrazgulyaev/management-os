# FC-OWNER-HOME — Owner Home

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/owner/01-home.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/owner/01-home.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Owner Home — `/owner` |
| **Pixel truth** | `cc-pixel-prompts/owner/01-home.md` |
| **Cross-surface partners** | Owner intelligence · Statements · Calendar |
| **Tables** | `owner_insights` · `owner_statements` · `owner_activity_log` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Portfolio at-a-glance | net payout, occupancy, ADR across owned villas | [core] | Have/verify |
| 2 | "What needs you" | owner_insights surfaced (renewal, maintenance, trend) | [ai] [cross] | Wire |
| 3 | Recent statement card | latest statement + sign-off CTA | [cross] | Wire |
| 4 | Upcoming personal stays | from calendar | [cross] | Wire |
| 5 | Villa performance tiles | per-villa mini KPIs |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### "What needs you"
- **Trigger:** owner_insights surfaced (renewal, maintenance, trend) (`/owner`)
- **Partner surface:** Owner intelligence
- **Event → effect:** populated by the mgmt owner-intelligence rebuild.

### Recent statement card
- **Trigger:** latest statement + sign-off CTA (`/owner`)
- **Partner surface:** Statements
- **Event → effect:** links to the statement lifecycle.

### Upcoming personal stays
- **Trigger:** from calendar (`/owner`)
- **Partner surface:** Calendar
- **Event → effect:** emit `home.upcoming_personal_stays` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] "What needs you": do the action on `/owner` → assert the effect on Owner intelligence with no manual refresh.
- [ ] Recent statement card: do the action on `/owner` → assert the effect on Statements with no manual refresh.
- [ ] Upcoming personal stays: do the action on `/owner` → assert the effect on Calendar with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
