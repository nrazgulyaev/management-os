# FC-DEVELOPMENT-CFO — CFO / Finance

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/02-cfo.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/02-cfo.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | CFO / Finance — `/development-os/cfo` |
| **Pixel truth** | `cc-pixel-prompts/development/02-cfo.md` |
| **Cross-surface partners** | Investors · Investor Portal · Investor Portal |
| **Tables** | `capital_calls` · `capital_call_allocations` · `distributions` · `tax_records` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | CFO console | cash / AR / AP / MTD spend / forecast burn KPIs | [core] | Have/verify |
| 2 | Capital waterfall | commitments→called→costs→cash bars |  | Have/verify |
| 3 | P&L by project | hard/soft/financing per project |  | Have/verify |
| 4 | Cash position bars | 6–8 week runway |  | Have/verify |
| 5 | Tax types (auto-categorised) | PPN/PPh/PBB MTD+YTD + filing status | [ai] | Build/verify |
| 6 | Shared-cost allocation | allocation rules across projects |  | Have/verify |
| 7 | Capital calls | calls + [id] | [cross] | Wire |
| 8 | Distributions | distribution runs | [cross] | Wire |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Capital calls
- **Trigger:** calls + [id] (`/development-os/cfo`)
- **Partner surface:** Investors · Investor Portal
- **Event → effect:** issuing a call notifies investors and appears in their portal.

### Distributions
- **Trigger:** distribution runs (`/development-os/cfo`)
- **Partner surface:** Investor Portal
- **Event → effect:** distributions surface to investors.

## Acceptance (behavioral)

- [ ] Capital calls: do the action on `/development-os/cfo` → assert the effect on Investors · Investor Portal with no manual refresh.
- [ ] Distributions: do the action on `/development-os/cfo` → assert the effect on Investor Portal with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
