# FC-OWNER-VILLAS — Owner Villas

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/owner/03-villas.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/owner/03-villas.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Owner Villas — `/owner/villas` |
| **Pixel truth** | `cc-pixel-prompts/owner/03-villas.md` |
| **Cross-surface partners** | Operations · Calendar · Finance |
| **Tables** | `villas` · `villa_photos` · `owner_activity_log` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Villa list | owned villas | [core] | Have/verify |
| 2 | Hero + gallery | villa_photos (0115) | [detail] | Build/verify |
| 3 | Health | condition + maintenance history | [cross] | Wire |
| 4 | Calendar | bookings + blocks | [cross] | Wire |
| 5 | Revenue | per-villa revenue | [cross] | Wire |
| 6 | Timeline | activity log (owner_activity_log) |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Health
- **Trigger:** condition + maintenance history (`/owner/villas`)
- **Partner surface:** Operations
- **Event → effect:** maintenance history mirrors ops tickets.

### Calendar
- **Trigger:** bookings + blocks (`/owner/villas`)
- **Partner surface:** Calendar
- **Event → effect:** emit `villas.calendar` → partner subscribes and reflects the change with no manual sync.

### Revenue
- **Trigger:** per-villa revenue (`/owner/villas`)
- **Partner surface:** Finance
- **Event → effect:** emit `villas.revenue` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] Health: do the action on `/owner/villas` → assert the effect on Operations with no manual refresh.
- [ ] Calendar: do the action on `/owner/villas` → assert the effect on Calendar with no manual refresh.
- [ ] Revenue: do the action on `/owner/villas` → assert the effect on Finance with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
