# FC-DEVELOPMENT-INVESTORS — Investors

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/06-investors.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/06-investors.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Investors — `/development-os/investors` |
| **Pixel truth** | `cc-pixel-prompts/development/06-investors.md` |
| **Cross-surface partners** | Investor Portal |
| **Tables** | `investors` · `commitments` · `capital_calls` · `capital_call_allocations` · `distributions` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Investors list | all investors | [core] | Have/verify |
| 2 | Investor detail [code] | profile + commitments | [detail] | Build/verify |
| 3 | Capital account | per-investor account | [cross] | Wire |
| 4 | Grant access | investor portal access | [cross] | Wire |
| 5 | Waterfall calculator | canonical distribution waterfall | [core] [cross] | Wire |
| 6 | XIRR / IRR tracker | per-investor return | [cross] | Wire |
| 7 | Capital-call issuer | pro-rata call generation | [cross] | Wire |
| 8 | Distributions + requests | distribution + investor-requests | [cross] | Wire |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Capital account
- **Trigger:** per-investor account (`/development-os/investors`)
- **Partner surface:** Investor Portal
- **Event → effect:** mirrors the investor's wallet/account view.

### Grant access
- **Trigger:** investor portal access (`/development-os/investors`)
- **Partner surface:** Investor Portal
- **Event → effect:** toggles the investor login.

### Waterfall calculator
- **Trigger:** canonical distribution waterfall (`/development-os/investors`)
- **Partner surface:** Investor Portal
- **Event → effect:** the same waterfall the investor sees in Distributions.

### XIRR / IRR tracker
- **Trigger:** per-investor return (`/development-os/investors`)
- **Partner surface:** Investor Portal
- **Event → effect:** emit `investors.xirr_irr_tracker` → partner subscribes and reflects the change with no manual sync.

### Capital-call issuer
- **Trigger:** pro-rata call generation (`/development-os/investors`)
- **Partner surface:** Investor Portal
- **Event → effect:** issuing a call creates a call the investor must fund; shows in their Capital calls tab.

### Distributions + requests
- **Trigger:** distribution + investor-requests (`/development-os/investors`)
- **Partner surface:** Investor Portal
- **Event → effect:** emit `investors.distributions_requests` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] Capital account: do the action on `/development-os/investors` → assert the effect on Investor Portal with no manual refresh.
- [ ] Grant access: do the action on `/development-os/investors` → assert the effect on Investor Portal with no manual refresh.
- [ ] Waterfall calculator: do the action on `/development-os/investors` → assert the effect on Investor Portal with no manual refresh.
- [ ] XIRR / IRR tracker: do the action on `/development-os/investors` → assert the effect on Investor Portal with no manual refresh.
- [ ] Capital-call issuer: do the action on `/development-os/investors` → assert the effect on Investor Portal with no manual refresh.
- [ ] Distributions + requests: do the action on `/development-os/investors` → assert the effect on Investor Portal with no manual refresh.
- [ ] Issuing a pro-rata capital call notifies each investor and appears in their portal Capital-calls tab with the correct allocation.
- [ ] A distribution run computes via the canonical waterfall and shows the identical figure to the investor.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
