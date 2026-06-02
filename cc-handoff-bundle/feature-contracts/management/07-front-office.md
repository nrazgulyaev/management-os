# FC-MANAGEMENT-FRONT-OFFICE — Front office

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/07-front-office.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/07-front-office.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Front office — `/dashboard/front-office` |
| **Pixel truth** | `cc-pixel-prompts/management/07-front-office.md` |
| **Cross-surface partners** | Guest Stay Portal · Operations |
| **Tables** | `bookings` · `checkins` · `villa_codes` |

## State machine — `checkin.status`

`not_started` → `in_progress` → `submitted` → `approved` → `code_issued`

Mirror of the guest-side check-in. Operator approval issues the door code that the guest then sees.

Store state on `checkin.status`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Today | arrivals / departures / in-house | [core] | Have/verify |
| 2 | Arrivals + check-in review | arrival list + 4-step check-in FSM | [cross] | Wire |
| 3 | Departures | departure list + checkout |  | Have/verify |
| 4 | In-house | current guests |  | Have/verify |
| 5 | Readiness gate | villa readiness before arrival | [cross] | Wire |
| 6 | Tax-export gate | block export until tax fields complete |  | Have/verify |
| 7 | Requests | front-office requests |  | Have/verify |
| 8 | Agents | id-ocr · visa-watcher · turnover-monitor · vip-prep | [ai] | Build/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Arrivals + check-in review
- **Trigger:** arrival list + 4-step check-in FSM (`/dashboard/front-office`)
- **Partner surface:** Guest Stay Portal
- **Event → effect:** guest submits check-in → appears here as "awaiting review" → operator approves → `villa_code` issued back to guest.

### Readiness gate
- **Trigger:** villa readiness before arrival (`/dashboard/front-office`)
- **Partner surface:** Operations
- **Event → effect:** blocks arrival until villa is ready.

## Acceptance (behavioral)

- [ ] Only the listed `checkin.status` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Arrivals + check-in review: do the action on `/dashboard/front-office` → assert the effect on Guest Stay Portal with no manual refresh.
- [ ] Readiness gate: do the action on `/dashboard/front-office` → assert the effect on Operations with no manual refresh.
- [ ] Guest completes check-in → operator sees it awaiting review → approve → the door code appears on the guest Stay home.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
