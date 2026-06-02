# FC-MANAGEMENT-BOOKINGS — Bookings

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/01-bookings.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/01-bookings.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Bookings — `/dashboard/bookings` |
| **Pixel truth** | `cc-pixel-prompts/management/01-bookings.md` |
| **Cross-surface partners** | Guest Stay Portal · Channels · Global |
| **Tables** | `bookings` · `charges` · `operation_tasks` |

## State machine — `booking.status`

`pending` → `confirmed` → `checked_in` → `checked_out` → `cancelled`

On `confirmed` the arrival-prep agent may auto-build an inspection task (operation_tasks).

Store state on `booking.status`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Bookings list | Filterable table: guest, villa, dates, channel, status, value | [core] | Have/verify |
| 2 | Status filter pills | confirmed / checked-in / checked-out / cancelled / pending | [core] | Have/verify |
| 3 | Booking detail | Full booking record + charges + timeline | [detail] | Build/verify |
| 4 | Per-charge view | charges/[chargeId] breakdown | [detail] | Build/verify |
| 5 | Edit booking | inline + full edit form |  | Have/verify |
| 6 | Guest-stay link | Open the token-gated guest stay for this booking | [cross] | Wire |
| 7 | Calendar view | month grid, occupancy, drag |  | Have/verify |
| 8 | Rate plans | rate plan list + seasons + overrides + quote |  | Have/verify |
| 9 | Channel sync tab | sync status per channel | [cross] | Wire |
| 10 | New booking flow | CTA + form |  | Have/verify |
| 11 | Command palette ⌘K | jump to booking / guest / villa | [cross] | Wire |
| 12 | Arrival-prep agent | auto-build inspection task on confirm | [ai] [design-only] | Build |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Guest-stay link
- **Trigger:** Open the token-gated guest stay for this booking (`/dashboard/bookings`)
- **Partner surface:** Guest Stay Portal
- **Event → effect:** opens the signed `/stay/[code]` surface for this booking; check-in state stays in sync (see guest/01-stay-portal).

### Channel sync tab
- **Trigger:** sync status per channel (`/dashboard/bookings`)
- **Partner surface:** Channels
- **Event → effect:** reflects channel cell-sync state (see management/05-channels).

### Command palette ⌘K
- **Trigger:** jump to booking / guest / villa (`/dashboard/bookings`)
- **Partner surface:** Global
- **Event → effect:** FlexSearch index spans bookings/guests/villas.

## Acceptance (behavioral)

- [ ] Only the listed `booking.status` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Guest-stay link: do the action on `/dashboard/bookings` → assert the effect on Guest Stay Portal with no manual refresh.
- [ ] Channel sync tab: do the action on `/dashboard/bookings` → assert the effect on Channels with no manual refresh.
- [ ] Command palette ⌘K: do the action on `/dashboard/bookings` → assert the effect on Global with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
