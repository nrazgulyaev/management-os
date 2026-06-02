# FC-MANAGEMENT-GUEST-STAYS — Cluster · Guest Stays

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/09-cluster-guest-stays.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/09-cluster-guest-stays.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Guest Stays — `/dashboard/guest-stays` |
| **Also covers** | guest-services · guest-journey · guest-ai |
| **Pixel truth** | `cc-pixel-prompts/management/09-cluster-guest-stays.md` |
| **Cross-surface partners** | Guest portal · Service fulfilment |
| **Tables** | `stay_tokens` · `guest_services` · `service_orders` · `guest_journey_rules` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Issue signed stay token | sign URL, prefill guide, no raw IDs in public URL | [core] | Have/verify |
| 2 | Active/revoked token list | per-villa, check-in window |  | Have/verify |
| 3 | Villa guide editor | sections · wifi · emergency · neighborhood | [cross] | Wire |
| 4 | Service catalog + price | published extras, 3 categories | [cross] | Wire |
| 5 | Service orders + vendor routing | order → vendor → fulfilment | [cross] | Wire |
| 6 | Journey rule library | pre/in/post phase, CTA vs system |  | Have/verify |
| 7 | Review requests by channel | post-stay routing |  | Have/verify |
| 8 | AI session ranking + take-over | autonomous % · escalations · drafts | [ai] | Build/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Villa guide editor
- **Trigger:** sections · wifi · emergency · neighborhood (`/dashboard/guest-stays`)
- **Partner surface:** Guest portal
- **Event → effect:** edits what the guest sees in the guide.

### Service catalog + price
- **Trigger:** published extras, 3 categories (`/dashboard/guest-stays`)
- **Partner surface:** Guest portal
- **Event → effect:** catalog the guest orders from.

### Service orders + vendor routing
- **Trigger:** order → vendor → fulfilment (`/dashboard/guest-stays`)
- **Partner surface:** Service fulfilment
- **Event → effect:** guest order dispatches to a vendor.

## Acceptance (behavioral)

- [ ] Villa guide editor: do the action on `/dashboard/guest-stays` → assert the effect on Guest portal with no manual refresh.
- [ ] Service catalog + price: do the action on `/dashboard/guest-stays` → assert the effect on Guest portal with no manual refresh.
- [ ] Service orders + vendor routing: do the action on `/dashboard/guest-stays` → assert the effect on Service fulfilment with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
