# FC-MANAGEMENT-OWNER-INTELLIGENCE — Owner intelligence

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/17-owner-intelligence.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/17-owner-intelligence.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Owner intelligence — `/dashboard/owner-intelligence` |
| **Pixel truth** | `cc-pixel-prompts/management/17-owner-intelligence.md` |
| **Cross-surface partners** | Owner Portal |
| **Tables** | `owner_insights` · `owner_visible_events` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Owner risk ring | per-owner risk signals | [ai] | Build/verify |
| 2 | Insights feed | occupancy/ADR/maintenance/renewal |  | Have/verify |
| 3 | Owner-events rebuild | rebuild owner_visible_events | [cross] | Wire |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Owner-events rebuild
- **Trigger:** rebuild owner_visible_events (`/dashboard/owner-intelligence`)
- **Partner surface:** Owner Portal
- **Event → effect:** rebuilds what the owner sees in "What needs you".

## Acceptance (behavioral)

- [ ] Owner-events rebuild: do the action on `/dashboard/owner-intelligence` → assert the effect on Owner Portal with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
