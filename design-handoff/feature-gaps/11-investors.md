# Feature gap · 11 · Investors (Dev P2)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built deep. Routes: `/development-os/investors` (`page.tsx` 9.3kb + `[code]` 10kb · `capital-account` 8.3kb · `grant-access` 12.9kb), plus `distributions`, `investor-requests`, `commitments`, and the `(investor-portal)` route group. Pure fns confirmed: `investors/{waterfall-calculator.ts, irr-tracker.ts, capital-call-issuer.ts, queries.ts}`. **Discard "not built".** Surviving: design↔code deltas only — the waterfall/IRR/capital-call engines are present, verify specifics against them.

**Design sources**
- Desktop: `cabinets/dev-p2/investors.html` — 6 sections (fund-level hero, layout variants, LP detail, distribution event, capital call, schema)
- Mobile: `mobile-pass-2.4-cabinets.html` § cabinet 07 — LP detail + capital-call notice
- Phase: 2.4 dev-03 · commit `549b417`

**Repo paths (state as of feature-gap audit window)**
- Pure domain: `_repo/src/features/investors/{waterfall-calculator,capital-call-issuer,irr-tracker,queries}.ts` — 4 files, **~300 lines of pure math**
- Agents: `_repo/src/features/ai-agents/investors/{waterfall-calculator,irr-tracker}.ts` — thin wrappers around the pure fns ✅ (parallel pattern to comp-policy-checker)
- Schema · investor capital (mig 0037): `investors`, `capital_commitments`, `capital_drawdowns`, `investor_wallets`, `wallet_transactions`, `distributions`, `distribution_allocations`
- Schema · companies + custom waterfall (mig 0048): `project_company_structures`, `company_structure_shareholders`, `waterfall_rules` (per-project or per-commitment scope)
- Schema · residual unit / settlement methods (mig 0049): waterfall settlement methods incl. `by_economic_waterfall`, `by_arconique_25_credit`, `by_unrecovered_capital`
- Schema · investor portal write ops (mig 0050): `investor_portal_requests`
- Schema · access control RLS (mig 0039): per-investor row-level read policies on wallet + waterfall_rules
- AI distribution suggestions (mig 0043): `ai_distribution_suggestions`
- **Not imported into this project:** `src/components/investors/*` (fund-overview, lp-card, waterfall-chart, distribution-event, capital-call-modal), `src/app/(dashboard)/development-os/investors/*`.

## TL;DR

Investors is the **strongest cabinet in the entire audited set, on every axis**: ~300 lines of pure financial math (canonical European 4-tier waterfall with catch-up + carry split, pro-rata capital-call issuer with drift-distribution rounding fix, real XIRR via Newton's method + MOIC/DPI/TVPI), **two agents that wrap the pure fns instead of stubbing** (waterfall-calculator + irr-tracker — the only such wrappers in the entire repo besides comp-policy-checker), and **the richest schema stack of any dev-OS cabinet**: 7 tables for capital flow (mig 0037), 3 tables for company structures + custom waterfall rules with project XOR commitment scope (mig 0048), full RLS row-level read policies for investors (mig 0039), and even `ai_distribution_suggestions` (mig 0043) for the AI co-pilot. The gaps cluster around **investor-side UI components** (none imported), the `queries.ts` read layer that's stubbed, and a missing `capital_call_notices` table that capital-call-issuer's draft output expects to persist into. This cabinet could ship to a customer if components landed and the read layer wired up.

---

## Section-by-section

### 01 · Hero · fund-level dashboard

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Fund summary (committed · drawn · distributed · NAV · IRR) | designed | computable from `capital_commitments + wallet_transactions + distributions`; `irr-tracker.ts.computePositionKpis()` ready | 🟡 schema + logic ready, no aggregation fn | ⭐ P1 |
| Waterfall chart (bars: proceeds → ROC → pref → catch-up → carry-LP → carry-GP) | designed | `waterfall-calculator.ts.runWaterfall()` returns precomputed `bars[]` ✅ — same shape the chart needs | ✅ logic shipped | — |
| Per-LP allocation pro-rata | designed | `runWaterfall()` returns `lpDistributions[]` pro-rata via `pctOfFund` ✅ | ✅ logic | — |
| LP roster card list | designed | `investors` + `capital_commitments` shipped ✅ | ✅ schema | — |
| Capital-call CTA | designed | `capital-call-issuer.ts.draftCapitalCall()` ✅; **no `capital_call_notices` persistence table** | 🟡 logic ready, write target missing | 🔥 P0 |
| Distribution-event CTA | designed | `distributions + distribution_allocations` shipped ✅; `runWaterfall()` ready | 🟡 logic + schema, no action | 🔥 P0 |
| AI distribution suggestions banner | designed (implied) | `ai_distribution_suggestions` table shipped ✅ (mig 0043) | ✅ schema | — |
| IRR / MOIC / DPI / TVPI footer | designed | `computePositionKpis()` ✅ | ✅ logic | — |

### 02 · Layout variants

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| **Variant A**: Fund-level dashboard (default) | designed | implied | 🔴 not picked in code | 💭 P2 |
| **Variant B**: Per-LP grid (table of LPs × KPIs) | designed | not in repo | 🔴 design only | 💭 P2 |

**Recommendation:** Variant A — waterfall chart is the cabinet's signature visualisation; LP roster sits as a side card. Variant B is an Excel-style report better surfaced as a CSV export.

### 03 · LP detail

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Full-page at `/investors/lp/[id]` | designed | route not in proj | 🟡 unknown | ⭐ P1 |
| LP identity + commitment terms | designed | `investors` + `capital_commitments` shipped ✅ | ✅ schema | — |
| Wallet ledger (chronological transactions) | designed | `investor_wallets + wallet_transactions` shipped with full RLS ✅ | ✅ schema | — |
| Per-LP KPIs (contributed · distributed · NAV · IRR · MOIC · DPI · TVPI) | designed | `computePositionKpis()` returns all 4 KPIs (irr · moic · dpi · tvpi) ✅ | ✅ logic | — |
| Distribution history | designed | `distribution_allocations` shipped ✅ | ✅ schema | — |
| Capital-call history | designed | `capital_drawdowns` shipped ✅ | ✅ schema | — |
| Documents (PPM · subscription · K-1) | designed | not surfaced in this cabinet's schema; likely owned by Documents cabinet | 🟡 cross-cabinet | ⭐ P1 |
| Custom waterfall override | designed | `waterfall_rules.scope=commitment` shipped ✅ (mig 0048) | ✅ schema | — |
| Wire/payment details | designed | likely on `investor_portal_requests` or extension | 🟡 unclear | ⭐ P1 |

### 04 · Distribution event

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Multi-step flow (proceeds → run waterfall → confirm allocations → execute) | designed | `runWaterfall()` ready for proceeds → allocations step ✅; multi-step orchestration not in proj | 🟡 logic ready | 🔥 P0 |
| Editable params (mgmt fee, pref %, catch-up %, carry split %) before run | designed | `WaterfallParams` type covers all 4 ✅ | ✅ schema | — |
| Preview bars before confirm | designed | `runWaterfall()` precomputes `bars[]` ✅ | ✅ logic | — |
| Pro-rata LP allocation preview | designed | `lpDistributions[]` ✅ | ✅ logic | — |
| Confirm → write `distributions` + per-LP `distribution_allocations` rows | designed | `distributions + distribution_allocations` shipped ✅ | 🟡 schema ready, action gap | 🔥 P0 |
| Per-LP wallet credit (writes `wallet_transactions`) | designed | `wallet_transactions.transaction_type` enum includes distribution-relevant types ✅ | ✅ schema | — |
| Notify-LPs action (email / portal) | designed | `investor_portal_requests` shipped ✅; no notify wiring | 🟡 schema, no wire | ⭐ P1 |
| Custom waterfall override path | designed | `waterfall_rules` shipped ✅; `runWaterfall()` doesn't currently read from it | 🟡 logic uses fixed params | ⭐ P1 |

### 05 · Capital call

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Call CTA → modal (number · total · purpose · due date) | designed | `CapitalCallInput` shape matches ✅ | ✅ logic | — |
| Pro-rata allocation preview with drift-fix rounding | designed | `draftCapitalCall()` ✅ with explicit drift-distribution to largest fractional remainders | ✅ logic shipped | — |
| Allocated-total = total invariant | designed | enforced in pure fn (sum after drift fix) ✅ | ✅ logic | — |
| Confirm → write notice + per-LP drawdown entries | designed | `capital_drawdowns` shipped ✅ for the per-LP drawdown side; **no `capital_call_notices` parent table** | 🔴 missing parent | 🔥 P0 |
| Reminder agent (chase un-paid LPs) | designed | 🔴 no `call-reminder` agent imported (referenced in `capital-call-issuer.ts` comment) | 🔴 missing | ⭐ P1 |
| Payment-received reconciliation | designed | `wallet_transactions.transaction_type='drawdown_received'` enumerated ✅ | ✅ schema | — |

### 06 · Schema · agents · routes

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| `investors` (entity identity) | designed | shipped (mig 0037) ✅ | ✅ | — |
| `capital_commitments` (negotiated terms per investor × project) | designed | shipped (mig 0037) ✅ | ✅ | — |
| `capital_drawdowns` (capital call per commitment) | designed | shipped (mig 0037) ✅ | ✅ | — |
| `investor_wallets` (per-commitment holding account) | designed | shipped (mig 0037) ✅ | ✅ | — |
| `wallet_transactions` (append-only ledger, IRR source-of-truth) | designed | shipped (mig 0037) ✅ with multi-currency support (USD/IDR/RUB/EUR/USDT/CNY) | ✅ | — |
| `distributions` + `distribution_allocations` | designed | shipped (mig 0037) ✅ | ✅ | — |
| `project_company_structures` + `company_structure_shareholders` (SPV layer) | designed | shipped (mig 0048) ✅ | ✅ | — |
| `waterfall_rules` (per-project XOR per-commitment custom waterfalls) | designed | shipped (mig 0048) ✅ | ✅ | — |
| Settlement methods (`by_economic_waterfall`, `by_arconique_25_credit`, `by_unrecovered_capital`) | designed | enumerated (mig 0049) ✅ | ✅ | — |
| `ai_distribution_suggestions` | designed | shipped (mig 0043) ✅ | ✅ | — |
| `investor_portal_requests` | designed | shipped (mig 0050) ✅ | ✅ | — |
| Per-investor RLS read policies on wallet + waterfall_rules | designed | shipped (migs 0039 + 0048) ✅ | ✅ | — |
| `capital_call_notices` (parent of `capital_drawdowns` for a single call event) | designed (implied) | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `waterfall_calculator` agent (wraps pure fn) | designed | shipped ✅ (thin wrapper) | ✅ | — |
| `irr-tracker` agent (wraps pure fn) | designed | shipped ✅ (thin wrapper) | ✅ | — |
| `call-reminder` agent | designed (referenced in capital-call-issuer.ts comment) | 🔴 not imported | 🔴 missing | ⭐ P1 |
| `investor-supervisor` copilot (cross-LP attention ranking, parallel to concierge_handoff) | implied | 🔴 not in registry (mig 0103) | 🔴 missing | ⭐ P1 |

---

## Cross-cutting

### Data wiring

| Concern | Status |
|---|---|
| Fund-level KPI aggregation | 🟡 schema ready; aggregation fn missing |
| `runWaterfall()` reads project/commitment-scoped `waterfall_rules` | 🟡 pure fn uses fixed params; needs `waterfall_rules` integration layer |
| `draftCapitalCall()` persists notice + per-LP rows | 🔴 blocked on `capital_call_notices` parent table |
| `computePositionKpis()` reads wallet ledger | 🟡 schema ready; reader fn missing |
| Distribution execute writes 3 tables atomically (`distributions` + N×`distribution_allocations` + N×`wallet_transactions`) | 🟡 schema ready; transaction-wrapper missing |

### Agents

| Agent | Declared | Real impl | Notes |
|---|---|---|---|
| `waterfall-calculator` | ✅ | ✅ **real** — wraps pure fn | One of two agent-wraps-pure-fn pattern instances in the repo |
| `irr-tracker` | ✅ | ✅ presumably wraps `computePositionKpis()` similarly | — |
| `call-reminder` | ✅ designed | 🔴 not imported | Chases un-paid LPs at notice + n days |
| `investor-supervisor` (copilot) | implied | 🔴 not registered | Cross-LP attention urgency ranker |

### Multi-currency

`wallet_transactions.original_currency` enumerates USD/IDR/RUB/EUR/USDT/CNY with `balance_*_after_usd_minor` tracked. This is a significant operational maturity signal — most of the audited dev-OS cabinets are single-currency. FX conversion happens at write-time; the pure waterfall + IRR fns operate on a single normalised currency (IDR per `runWaterfall()`'s `proceedsIdr` shape, but USD for the wallet ledger). **Reconcile**: waterfall should accept currency unit explicitly; today it's just labeled `Idr` in the suffix.

### RLS

Investor-side RLS is the **most polished access-control story in the repo** — per-investor read policies on `wallet_transactions` and `waterfall_rules` use `public.current_investor_id()` helper (established mig 0039). Investor-portal users can only see their own commitments. This pattern is the right template for owner-portal (cabinets 16-22).

### Custom waterfall rules

`waterfall_rules` with mutually-exclusive `scope IN ('project', 'commitment')` is a sophisticated design — most LPs use the project default, some LPs negotiate a per-commitment override. The 4-tier types enumerated (`arconique_25_credit`, `preferred_return_then_split`, `waterfall_with_hurdle`, `capital_first_then_split`, `tiered_promote`) cover the major waterfall shapes. **Gap**: `runWaterfall()` doesn't consult this table yet; it accepts `WaterfallParams` directly. Needs a `loadWaterfallParams(commitmentId)` layer.

---

## Recommended additions (prioritized)

### 🔥 P0 — ship before claiming "investor cabinet complete"

1. **Add `capital_call_notices` table** — `id · org_id · fund_id · number · total_idr · purpose · notice_at · due_at · status (draft/sent/paid/partial/cancelled) · created_by · sent_at`. Becomes parent FK for `capital_drawdowns.notice_id`.
2. **Wire `draftCapitalCall()` → persist** — write notice row, write per-LP `capital_drawdowns` rows from `allocations[]`, atomic transaction. Trigger `call-reminder` agent enqueue.
3. **Wire distribution execute action** — atomic 3-table write (`distributions` parent + per-LP `distribution_allocations` from `lpDistributions[]` + per-LP `wallet_transactions` credit). Use `runWaterfall()` output as the source.
4. **Build `loadWaterfallParams(commitmentId)` resolver** — reads `waterfall_rules` for the commitment first, falls back to project-scope rules, then to fund defaults. Feed result into `runWaterfall()`.
5. **Wire `queries.ts` read fns** — `getFundOverview()`, `getLpDetail(id)`, `getDistributionEventPreview()`. All sources exist.

### ⭐ P1 — Phase 2.6

6. **Bring in `call-reminder` agent** — cron daily, finds un-paid `capital_call_notices` past `due_at + 7d`, sends notification via `investor_portal_requests`.
7. **Add `investor-supervisor` copilot to registry** (mig 0103 widen check).
8. **Lock Variant A** in design copy.
9. **Per-investor portal write actions** — `investor_portal_requests` exists; surface as "request distribution detail", "request K-1", "update wire details" actions.
10. **Documents linking** — cross-cabinet to Documents (cabinet 21), but the LP detail page needs to surface PPM / subscription / K-1 documents.
11. **AI distribution suggestions surface** — `ai_distribution_suggestions` table exists; surface as the "Highlighted recommendation" card on distribution event flow. Needs an agent to populate (`distribution-recommender` parallel to `pricing-recommender`).
12. **Currency normalisation in `runWaterfall()`** — accept `currency` field explicitly, not `idr` suffix on `proceedsIdr`.

### 💭 P2

13. **Variant B (per-LP grid)** documented as alternate or shipped as CSV export.
14. **Multi-fund support** — current shape assumes one fund; design allows for it but not stress-tested.
15. **Hurdle-rate above pref** — currently single-tier pref; some LP agreements have multi-hurdle. The pure fn would need extension.

---

## Things outside scope

- Tax K-1 generation (separate Tax cabinet, future)
- Sub-doc / accreditation collection at investor onboarding (lives in onboarding flow, not investor cabinet)
- Secondary market for LP interests (out of scope per design)

## Open questions for product

- **Waterfall hold-years input** — `runWaterfall()` takes `holdYears` to compute pref. Where does this come from? Per-commitment? Computed from `capital_commitments.signed_at` → distribution event date? Recommend: computed automatically; manual override only if needed.
- **Catch-up math** — current implementation uses a simplified linear catch-up formula. Most actual LPAs spell out a full catch-up tier. Confirm whether the simplification is acceptable for v1 or needs the literal LPA-spec math.
- **Drift assignment in capital call** — current code assigns drift to LPs with largest fractional remainder. Some LPAs require drift to GP. Confirm which is operationally desired.
- **Multi-currency proceeds** — distribution event takes proceeds in a single currency. What if the underlying property sold in USD but LPs committed in IDR? Recommend: convert proceeds at sale-date FX (lock via `wallet_transactions.fx_rate_*_at_*`), then waterfall in committed currency.
- **`call-reminder` cadence** — design doesn't pin reminder frequency. Suggest: T-7d, T-1d, T+1d, T+7d (escalate to manager), T+14d (escalate to director).
- **AI distribution suggestions provenance** — table exists but no agent populates it. Who drafts these? Suggest: `distribution-recommender` agent reads project cashflow + active commitments + last distribution date, emits "consider $XM distribution from project Y" recommendations.
