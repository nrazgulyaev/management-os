# FC-MANAGEMENT-WORKSPACE — Workspace overview

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/14-workspace.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/14-workspace.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Workspace overview — `/dashboard` |
| **Pixel truth** | `cc-pixel-prompts/management/14-workspace.md` |
| **Cross-surface partners** | Owner Portal |
| **Tables** | see migration / data-wiring prompt |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Greeting + 5-KPI strip | occupancy / ADR / RevPAR / gross MTD / net-to-owners | [core] | Have/verify |
| 2 | Today snapshot | arrivals/departures table |  | Have/verify |
| 3 | Revenue by channel | MTD share bars |  | Have/verify |
| 4 | Six-month gross | bar chart |  | Have/verify |
| 5 | Owners YTD payouts | top owners |  | Have/verify |
| 6 | Portfolio table | per-project occ/ADR/revenue |  | Have/verify |
| 7 | Recent digests tile | agent digest feed | [ai] | Build/verify |
| 8 | Statement nudge band | awaiting sign-off CTA | [cross] | Wire |
| 9 | Attention/triage feed | unified cross-cabinet actionable queue | [design-only] | Build |
| 10 | Operational-health tiles | open-maintenance / housekeeping / owner-stay-requests | [design-only] | Build |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Statement nudge band
- **Trigger:** awaiting sign-off CTA (`/dashboard`)
- **Partner surface:** Owner Portal
- **Event → effect:** counts statements awaiting owner sign-off.

## Acceptance (behavioral)

- [ ] Statement nudge band: do the action on `/dashboard` → assert the effect on Owner Portal with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
