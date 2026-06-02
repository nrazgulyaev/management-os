# FC-MANAGEMENT-OPERATIONS — Operations

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/03-operations.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/03-operations.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Operations — `/dashboard/operations` |
| **Pixel truth** | `cc-pixel-prompts/management/03-operations.md` |
| **Cross-surface partners** | Front office · Bookings · Guest portal |
| **Tables** | `operation_tasks` · `maintenance_tickets` · `sla_breaches` · `turnovers` |

## State machine — `maintenance_ticket.status`

`open` → `triaged` → `assigned` → `in_progress` → `blocked` → `resolved` → `verified` → `closed`

Severity P0–P3 drives `computeSlaStatus`; breaches write `sla_breaches` (0112).

Store state on `maintenance_ticket.status`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Command center | today: arrivals / tickets / turnovers hero | [core] | Have/verify |
| 2 | Villa status board | live readiness tiles (8 states) | [cross] | Wire |
| 3 | Housekeeping board | today's turnovers, assignee, progress |  | Have/verify |
| 4 | Maintenance tickets | list + severity + 8-state status |  | Have/verify |
| 5 | Ticket detail | resolve / escalate | [detail] | Build/verify |
| 6 | New maintenance ticket | modal + photo + villa |  | Have/verify |
| 7 | Tasks | operation_tasks list + detail + new | [cross] | Wire |
| 8 | Preventive | preventive plans + new |  | Have/verify |
| 9 | Service requests | guest-side requests + detail | [cross] | Wire |
| 10 | Damage reports | list + new |  | Have/verify |
| 11 | Checklists | checklist templates |  | Have/verify |
| 12 | Turnovers | turnover board |  | Have/verify |
| 13 | SLA model | P0–P3 targets + computeSlaStatus | [design-only] | Build |
| 14 | Severity vocabulary | reconcile low/normal/high/urgent ↔ P0–P3 |  | Have/verify |
| 15 | Operations Copilot | daily-digest agent | [ai] | Build/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Villa status board
- **Trigger:** live readiness tiles (8 states) (`/dashboard/operations`)
- **Partner surface:** Front office
- **Event → effect:** readiness gates arrival.

### Tasks
- **Trigger:** operation_tasks list + detail + new (`/dashboard/operations`)
- **Partner surface:** Bookings
- **Event → effect:** arrival-prep agent creates tasks here.

### Service requests
- **Trigger:** guest-side requests + detail (`/dashboard/operations`)
- **Partner surface:** Guest portal
- **Event → effect:** guest request → ops queue.

## Acceptance (behavioral)

- [ ] Only the listed `maintenance_ticket.status` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Villa status board: do the action on `/dashboard/operations` → assert the effect on Front office with no manual refresh.
- [ ] Tasks: do the action on `/dashboard/operations` → assert the effect on Bookings with no manual refresh.
- [ ] Service requests: do the action on `/dashboard/operations` → assert the effect on Guest portal with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
