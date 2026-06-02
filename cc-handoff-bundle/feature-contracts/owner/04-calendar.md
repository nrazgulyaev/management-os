# FC-OWNER-CALENDAR — Owner Calendar

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/owner/04-calendar.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/owner/04-calendar.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Owner Calendar — `/owner/calendar` |
| **Pixel truth** | `cc-pixel-prompts/owner/04-calendar.md` |
| **Cross-surface partners** | Owners · Owner-stays |
| **Tables** | `bookings` · `owner_stay_requests` · `calendar_blocks` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Month calendar | bookings + personal stays + blocks | [core] | Have/verify |
| 2 | Personal stay request | book own villa within quota | [cross] | Wire |
| 3 | Quota tracking | remaining owner-stay nights |  | Have/verify |
| 4 | Pipeline list | upcoming bookings |  | Have/verify |
| 5 | Calendar prefs | /owner/preferences/calendar |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Personal stay request
- **Trigger:** book own villa within quota (`/owner/calendar`)
- **Partner surface:** Owners · Owner-stays
- **Event → effect:** request lands in the mgmt owner-stays queue for approval.

## Acceptance (behavioral)

- [ ] Personal stay request: do the action on `/owner/calendar` → assert the effect on Owners · Owner-stays with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
