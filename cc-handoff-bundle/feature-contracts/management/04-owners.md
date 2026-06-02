# FC-MANAGEMENT-OWNERS — Owners

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/04-owners.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/04-owners.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Owners — `/dashboard/owners` |
| **Pixel truth** | `cc-pixel-prompts/management/04-owners.md` |
| **Cross-surface partners** | Owner Portal · Owner intelligence · Owner Portal · Calendar |
| **Tables** | `owners` · `owner_insights` · `onboarding_drafts` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Owners list | all owners + attention flags | [core] | Have/verify |
| 2 | Owner detail | profile + villas + statements | [detail] | Build/verify |
| 3 | Owner access | grant portal access per owner | [cross] | Wire |
| 4 | Edit owner | form |  | Have/verify |
| 5 | New owner | onboarding (onboarding_drafts, 14d TTL) |  | Have/verify |
| 6 | Owner intelligence | risk-ring + insights | [ai] [cross] | Wire |
| 7 | Owner-stays cluster | requests + policies + finance-bridge + equivalence-groups | [cross] | Wire |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Owner access
- **Trigger:** grant portal access per owner (`/dashboard/owners`)
- **Partner surface:** Owner Portal
- **Event → effect:** toggles the owner's login.

### Owner intelligence
- **Trigger:** risk-ring + insights (`/dashboard/owners`)
- **Partner surface:** Owner intelligence
- **Event → effect:** occupancy/ADR/maintenance/renewal signals.

### Owner-stays cluster
- **Trigger:** requests + policies + finance-bridge + equivalence-groups (`/dashboard/owners`)
- **Partner surface:** Owner Portal · Calendar
- **Event → effect:** personal-stay requests flow from the owner calendar.

## Acceptance (behavioral)

- [ ] Owner access: do the action on `/dashboard/owners` → assert the effect on Owner Portal with no manual refresh.
- [ ] Owner intelligence: do the action on `/dashboard/owners` → assert the effect on Owner intelligence with no manual refresh.
- [ ] Owner-stays cluster: do the action on `/dashboard/owners` → assert the effect on Owner Portal · Calendar with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
