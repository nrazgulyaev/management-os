# FC-GUEST-STAY-PORTAL — Guest Stay Portal

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/guest/01-stay-portal.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/guest/01-stay-portal.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Guest Stay Portal — `/stay/[code]` |
| **Also covers** | check-in · concierge · services · guide · requests · emergency · explore |
| **Pixel truth** | `cc-pixel-prompts/guest/01-stay-portal.md` |
| **Cross-surface partners** | Mgmt Front office · Mgmt Concierge · Mgmt Guest-services · Mgmt Guest-stays · Mgmt Operations |
| **Tables** | `stay_tokens` · `checkins` · `villa_codes` · `guest_ai_concierge_sessions` · `service_orders` |

## State machine — `checkin.status`

`not_started` → `in_progress` → `submitted` → `approved` → `code_issued`

Owner of the door-code reveal: the code shows ONLY after the operator approves in Front office.

Store state on `checkin.status`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Stay home | countdown-to-arrival, stay timeline, service list (2 variants A/B) | [core] | Have/verify |
| 2 | Online check-in | 4-step: guests + passport scan + ETA | [core] [cross] | Wire |
| 3 | Villa code reveal | door code appears after check-in approved | [cross] | Wire |
| 4 | Concierge chat | human + AI-assistant bubble (attribution hidden from guest) | [ai] [cross] | Wire |
| 5 | Services + cart | category chips + service cards → order | [cross] | Wire |
| 6 | Villa guide | wifi (copy password), in-home rows, house rules | [cross] | Wire |
| 7 | Requests | new-request CTA + active/done cards | [cross] | Wire |
| 8 | Emergency / contacts | call-manager banner + contact rows + villa address |  | Have/verify |
| 9 | Nearby / explore | map pins + place cards; "play" builds route → handoff to Google Maps |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Online check-in
- **Trigger:** 4-step: guests + passport scan + ETA (`/stay/[code]`)
- **Partner surface:** Mgmt Front office
- **Event → effect:** guest submits → appears in Front office as awaiting review → operator approves → door code issued back here.

### Villa code reveal
- **Trigger:** door code appears after check-in approved (`/stay/[code]`)
- **Partner surface:** Mgmt Front office
- **Event → effect:** renders `villa_codes` only once `checkin.status=code_issued`.

### Concierge chat
- **Trigger:** human + AI-assistant bubble (attribution hidden from guest) (`/stay/[code]`)
- **Partner surface:** Mgmt Concierge
- **Event → effect:** binds to guest_ai_concierge_sessions; escalations surface in mgmt concierge inbox.

### Services + cart
- **Trigger:** category chips + service cards → order (`/stay/[code]`)
- **Partner surface:** Mgmt Guest-services
- **Event → effect:** order dispatches to a vendor via service fulfilment.

### Villa guide
- **Trigger:** wifi (copy password), in-home rows, house rules (`/stay/[code]`)
- **Partner surface:** Mgmt Guest-stays
- **Event → effect:** content edited in the mgmt guide editor.

### Requests
- **Trigger:** new-request CTA + active/done cards (`/stay/[code]`)
- **Partner surface:** Mgmt Operations
- **Event → effect:** a request creates an ops service request.

## Acceptance (behavioral)

- [ ] Only the listed `checkin.status` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Online check-in: do the action on `/stay/[code]` → assert the effect on Mgmt Front office with no manual refresh.
- [ ] Villa code reveal: do the action on `/stay/[code]` → assert the effect on Mgmt Front office with no manual refresh.
- [ ] Concierge chat: do the action on `/stay/[code]` → assert the effect on Mgmt Concierge with no manual refresh.
- [ ] Services + cart: do the action on `/stay/[code]` → assert the effect on Mgmt Guest-services with no manual refresh.
- [ ] Villa guide: do the action on `/stay/[code]` → assert the effect on Mgmt Guest-stays with no manual refresh.
- [ ] Requests: do the action on `/stay/[code]` → assert the effect on Mgmt Operations with no manual refresh.
- [ ] Guest completes check-in → Front office shows it awaiting review → operator approves → the villa door code appears on the guest Stay home.
- [ ] Tapping "play" on a nearby place opens a Google Maps route from the villa location.
- [ ] A guest service order appears in mgmt service fulfilment and routes to a vendor.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Out of the current redesign wave per CLAUDE.md — confirm greenlight before building.
- Nearby "play" = `https://www.google.com/maps/dir/?api=1&origin=<villa>&destination=<place>` deep link — confirm origin = villa geocode.
