# FC-INVESTOR-INVESTOR-PORTAL — Investor Portal

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/investor/01-investor-portal.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/investor/01-investor-portal.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Investor Portal — `/investor` |
| **Also covers** | capital-calls · distributions · commitments · forecasts · documents · wallet |
| **Pixel truth** | `cc-pixel-prompts/investor/01-investor-portal.md` |
| **Cross-surface partners** | Dev OS · Investors · Dev OS |
| **Tables** | `investors` · `commitments` · `capital_calls` · `capital_call_allocations` · `distributions` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Overview (A/B) | portfolio position, called vs committed, return | [core] | Have/verify |
| 2 | Capital calls | outstanding calls to fund | [core] [cross] | Wire |
| 3 | Distributions / waterfall | distribution history via canonical waterfall | [cross] | Wire |
| 4 | Commitments | per-project commitment + priority |  | Have/verify |
| 5 | Forecasts / XIRR | projected return + XIRR | [cross] | Wire |
| 6 | Documents | LP documents | [cross] | Wire |
| 7 | Wallet | capital account balance + movements | [cross] | Wire |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Capital calls
- **Trigger:** outstanding calls to fund (`/investor`)
- **Partner surface:** Dev OS · Investors
- **Event → effect:** a call issued in Dev CFO/Investors appears here with the investor's pro-rata allocation.

### Distributions / waterfall
- **Trigger:** distribution history via canonical waterfall (`/investor`)
- **Partner surface:** Dev OS · Investors
- **Event → effect:** identical figure to the dev-side waterfall calculator.

### Forecasts / XIRR
- **Trigger:** projected return + XIRR (`/investor`)
- **Partner surface:** Dev OS · Investors
- **Event → effect:** emit `investor-portal.forecasts_xirr` → partner subscribes and reflects the change with no manual sync.

### Documents
- **Trigger:** LP documents (`/investor`)
- **Partner surface:** Dev OS
- **Event → effect:** emit `investor-portal.documents` → partner subscribes and reflects the change with no manual sync.

### Wallet
- **Trigger:** capital account balance + movements (`/investor`)
- **Partner surface:** Dev OS · Investors
- **Event → effect:** emit `investor-portal.wallet` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] Capital calls: do the action on `/investor` → assert the effect on Dev OS · Investors with no manual refresh.
- [ ] Distributions / waterfall: do the action on `/investor` → assert the effect on Dev OS · Investors with no manual refresh.
- [ ] Forecasts / XIRR: do the action on `/investor` → assert the effect on Dev OS · Investors with no manual refresh.
- [ ] Documents: do the action on `/investor` → assert the effect on Dev OS with no manual refresh.
- [ ] Wallet: do the action on `/investor` → assert the effect on Dev OS · Investors with no manual refresh.
- [ ] A capital call issued in Dev OS appears in the investor's Capital-calls tab with the correct pro-rata amount.
- [ ] The distribution figure shown to the investor equals the dev-side canonical waterfall output exactly.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Out of the current redesign wave per CLAUDE.md — confirm greenlight before building.
