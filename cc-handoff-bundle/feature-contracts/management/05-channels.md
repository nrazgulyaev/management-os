# FC-MANAGEMENT-CHANNELS — Channels

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/05-channels.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/05-channels.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Channels — `/dashboard/channels` |
| **Pixel truth** | `cc-pixel-prompts/management/05-channels.md` |
| **Cross-surface partners** | Bookings |
| **Tables** | `channel_connections` · `reservations` · `rate_cells` |

## State machine — `channel cell`

`pending` → `synced` → `stale` → `conflict` → `blocked` → `booked`

Per-villa × channel cell. A 3-way conflict (local vs Airbnb vs Booking) resolves via the conflict modal.

Store state on `channel cell`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Channel grid | per-villa × channel cell-sync state | [core] | Have/verify |
| 2 | 6-state cell FSM | pending/synced/stale/conflict/blocked/booked | [core] | Have/verify |
| 3 | Connect wizard | 3-step channel connection |  | Have/verify |
| 4 | Listing matcher | match ext listings → villas (matched/ambiguous/unmatched) | [ai] | Build/verify |
| 5 | Conflict resolver | 3-way conflict resolution + modal | [cross] | Wire |
| 6 | Sync health | feeds status + last sync |  | Have/verify |
| 7 | Rate-cells storage | design wants rate_cells; app on channel_connections/reservations | [design-only] | Build |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Conflict resolver
- **Trigger:** 3-way conflict resolution + modal (`/dashboard/channels`)
- **Partner surface:** Bookings
- **Event → effect:** resolving a conflict writes the winning reservation, reflected in Bookings.

## Acceptance (behavioral)

- [ ] Only the listed `channel cell` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Conflict resolver: do the action on `/dashboard/channels` → assert the effect on Bookings with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
