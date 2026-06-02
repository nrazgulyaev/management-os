# FC-MANAGEMENT-PRICING — Dynamic pricing

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/06-dynamic-pricing.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/06-dynamic-pricing.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Dynamic pricing — `/dashboard/pricing` |
| **Pixel truth** | `cc-pixel-prompts/management/06-dynamic-pricing.md` |
| **Cross-surface partners** | Channels |
| **Tables** | `pricing_rules` · `pricing_pins` · `pricing_runs` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Pricing calendar | per-night rate curve | [core] | Have/verify |
| 2 | Rule sets | priority rule list + detail + new |  | Have/verify |
| 3 | Rule evaluator | 8-step engine + priority resolution |  | Have/verify |
| 4 | Comp set | comp-villa similarity + observations | [ai] | Build/verify |
| 5 | Channel push | push rates to channels + logs | [cross] | Wire |
| 6 | Quote | ad-hoc quote tool |  | Have/verify |
| 7 | Pricing pins / runs | pins + run accept/reject log | [design-only] | Build |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Channel push
- **Trigger:** push rates to channels + logs (`/dashboard/pricing`)
- **Partner surface:** Channels
- **Event → effect:** accepted rates push to channel cells.

## Acceptance (behavioral)

- [ ] Channel push: do the action on `/dashboard/pricing` → assert the effect on Channels with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
