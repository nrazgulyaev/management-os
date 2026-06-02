# FC-MANAGEMENT-DISTRIBUTION-PAYMENTS — Cluster · Distribution & Payments

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/10-cluster-distribution-payments.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/10-cluster-distribution-payments.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Distribution & Payments — `/dashboard/direct-bookings` |
| **Also covers** | payments · service-fulfilment · integrations |
| **Pixel truth** | `cc-pixel-prompts/management/10-cluster-distribution-payments.md` |
| **Cross-surface partners** | Channels · Finance |
| **Tables** | `direct_bookings` · `holds` · `payments` · `webhook_events` |

## State machine — `direct_booking`

`enquiry` → `hold` → `deposit` → `confirmed`

Holds expire after 48h. Deposit gate: pending → manually-marked-paid.

Store state on `direct_booking`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Direct-booking funnel | enquiry → hold → deposit → confirmed | [core] | Have/verify |
| 2 | Holds (48h expiry) | hold list + detail |  | Have/verify |
| 3 | Requests + messages | request detail + message threads |  | Have/verify |
| 4 | Reconciliation vs channel cal | unmatched direct bookings | [cross] | Wire |
| 5 | Deposit workflow | pending → manually-marked-paid gate |  | Have/verify |
| 6 | Payment providers | manual stub · Stripe/Xendit slots |  | Have/verify |
| 7 | Webhook envelopes (idempotent) | provider events log |  | Have/verify |
| 8 | Fulfilment triage queue | new/triage/awaiting-vendor/scheduled |  | Have/verify |
| 9 | Vendor dispatch + ETA | assign vendor, track ETA |  | Have/verify |
| 10 | Vendor invoices + ratings | capture invoice + guest rating |  | Have/verify |
| 11 | Finance bridge | completed fulfilment → revenue/expense | [cross] | Wire |
| 12 | Calendar feeds + status | iCal feeds, sync-all, error states |  | Have/verify |
| 13 | Conflicts (double-book/orphan) | resolve queue |  | Have/verify |
| 14 | Automation rules | block/notify rules |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Reconciliation vs channel cal
- **Trigger:** unmatched direct bookings (`/dashboard/direct-bookings`)
- **Partner surface:** Channels
- **Event → effect:** flags double-bookings against channel calendar.

### Finance bridge
- **Trigger:** completed fulfilment → revenue/expense (`/dashboard/direct-bookings`)
- **Partner surface:** Finance
- **Event → effect:** posts a revenue/expense line.

## Acceptance (behavioral)

- [ ] Only the listed `direct_booking` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Reconciliation vs channel cal: do the action on `/dashboard/direct-bookings` → assert the effect on Channels with no manual refresh.
- [ ] Finance bridge: do the action on `/dashboard/direct-bookings` → assert the effect on Finance with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
