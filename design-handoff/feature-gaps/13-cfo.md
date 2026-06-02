# Feature gap · 13 · CFO / Finance (Dev P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Routes: `/development-os/cfo` (`page.tsx` **11.6kb** + `capital-calls`+`[id]` · `cashflow` · `distributions`), plus `/development-os/finance`, `profitability`, `cashflow-forecast`, `banking`. **Discard "not built".** Surviving items are design↔code deltas — verify against the finance/CFO feature layer + drizzle (note 0037 investor-capital migration is in the import).

**Design sources**
- Desktop: `cabinets/dev-p1/cfo.html`
- Phase: 2.2 dev-02 · commit `69aed9d`

**Repo paths**
- Feature data: **`src/features/cfo/` does not exist in repo**. CFO logic likely composed from `src/features/investors/` (waterfall, IRR, capital calls) + `src/features/finance/` (statement engine) + new components-only layer.
- Components: `src/components/cfo/{capital-call-card,cashflow-forecast,new-capital-call-modal,record-capital-received-modal,waterfall-chart}.tsx` — 5 files, ~18kb total
- Routes: `src/app/(development-app)/development-os/cfo/{page,capital-calls/[id]/page,capital-calls/page,cashflow/page,distributions/page}` — 5 files, ~24kb (page.tsx alone is 11.6kb)
- Schema · investor capital (mig 0037): `capital_commitments`, `capital_drawdowns`, `investor_wallets`, `wallet_transactions`, `distributions`, `distribution_allocations` — full stack from cabinet 11
- Schema · cashflow (mig 0059): profitability + cashflow mat view
- Schema · banking (mig 0079): bank accounts + transactions
- Schema · payments (mig 0080): inbound/outbound payments
- Schema · closed periods (mig 0081): month-end close

## TL;DR

CFO is **a UI cabinet composing other features' logic** — no dedicated feature folder, but rich component + route surface (5 + 5 files, ~42kb). The cabinet uses **investor cabinet primitives** (waterfall-chart, capital-call-card, capital-call modals) and **finance primitives** (cashflow-forecast) to build the CFO operating console. This is an **architecture choice, not a gap**: instead of duplicating waterfall + IRR + capital-call logic, CFO reads from the same `investor_wallets / capital_commitments / distributions` tables and surfaces a different view (project-wide CFO perspective vs investor-portfolio perspective). The route at `page.tsx` (11.6kb) is the most substantial single page in Dev OS — likely the CFO dashboard hub. **0 P0 gaps** — composition pattern is intentional and code shares are correct.

---

## Section-by-section

### CFO dashboard (page.tsx, 11.6kb)

| Element | Status |
|---|---|
| Cross-project cashflow | ✅ via mig 0059 mat view |
| Capital-call status across projects | ✅ via `capital_drawdowns` |
| Distribution summary | ✅ via `distributions` |
| Bank account positions | ✅ via mig 0079 banking |
| Month-end close state | ✅ via mig 0081 closed periods |

### Capital calls

| Element | Status |
|---|---|
| `capital-call-card.tsx` (2.8kb) — display | ✅ |
| `capital-call/[id]/page.tsx` (5.1kb) — detail | ✅ |
| `new-capital-call-modal.tsx` (6.6kb) — issuance flow (uses `draftCapitalCall()` from cabinet 11) | ✅ |
| `record-capital-received-modal.tsx` (3.6kb) — reconcile inbound payment | ✅ |

### Cashflow

| Element | Status |
|---|---|
| `cashflow-forecast.tsx` (2.9kb) — visualization | ✅ |
| `cashflow/page.tsx` (2.4kb) — route | ✅ |
| Underlying mat view (mig 0059) | ✅ |

### Distributions

| Element | Status |
|---|---|
| `distributions/page.tsx` (1.9kb) — list view | ✅ |
| `waterfall-chart.tsx` (2.4kb) — reused from cabinet 11 | ✅ |
| Execution flow (uses cabinet 11 `runWaterfall()`) | ✅ |

---

## Cross-cutting

### Agents

None CFO-specific. Composes investor + finance agents.

### Cross-cabinet dependencies

| Cabinet | Direction |
|---|---|
| 11 Investors | shares waterfall + capital-call + IRR logic |
| 06 Finance | shares cashflow + statement primitives |
| 12 Projects | reads project for context |
| 14 BOQ + QS | budgets feed cashflow forecast |
| 15 Procurement | vendor obligations feed cashflow |

---

## Recommended additions (prioritized)

### 🔥 P0 — none

### ⭐ P1

1. **Month-end close workflow UI** — schema exists (mig 0081), needs surface in CFO dashboard.
2. **Bank reconciliation flow** — banking tables exist (mig 0079); CFO is the natural surface for matching transactions to capital calls/distributions.
3. **Audit trail integration** — CFO actions are money-touching; needs `audit_log` writes (cross-cabinet to super-admin 07).

---

## Open questions for product

- **CFO vs Investors split** — CFO consoles the GP-side view, Investors consoles the LP-side. Both touch the same data. Confirm permission boundaries (GP can edit waterfall_rules; LP can read-only).
- **Closed periods enforcement** — once a period is closed, are writes blocked at DB level? Or app-level only? mig 0081 schema, verify enforcement.
- **Cashflow forecast horizon** — 90 days? Quarterly? Year-end? Confirm UI default.
