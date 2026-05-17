# Full platform audit — 2026-05-17

SPRINT AUDIT-1. Snapshot of route inventory, visual fidelity, button wiring, schema/seed coverage and pending sprint catalogue. Documentation only; no source files modified.

| Item | Value |
|---|---|
| Working tree branch | `main` |
| Last commit | `fd23038 feat(cabinets): TASK-8-MISSING-ROUTES 2-3/9 — /warehouse + /marketing ported` |
| Build state | HF-16 config-stable (3/3 audit:runtime-config passes) |
| Audit date | 2026-05-17 |
| Auditor | AUDIT-1 |

---

## 1. Executive summary

| Metric | Count |
|---|---|
| Total `page.tsx` routes catalogued | **637** |
| Visual class — NEW (Claude Design primitives) | **18** routes |
| Visual class — OLD (`@/components/ui/*` pre-Claude-Design) | ~580 routes |
| Visual class — HYBRID | ~6 routes (Claude shell on OLD body, mostly Dev OS sub-routes under `_layout` wrappers) |
| Visual class — EMPTY / STUB (<30 LOC) | **27** routes (24 in `(dashboard)`, 3 in `(development-app)`) |
| Functional — LIVE | ~470 (dominated by Mgmt OS dashboard subroutes with real services) |
| Functional — MOCK | ~140 (mostly Dev OS leaf pages from TASK-6/7 visual ports) |
| Functional — STUB / REDIRECT | ~27 |

### Route group totals

| Group | page.tsx count | NEW visual | OLD visual | Stubs (<30 LOC) |
|---|---:|---:|---:|---:|
| `(auth)` | 6 | 0 | 6 | 0 |
| `(buyer-portal)` | 6 | 0 | 6 | 1 |
| `(dashboard)` (Mgmt OS admin) | 274 | 6 | 244 | 24 |
| `(development-app)` (Dev OS admin) | 250 | 10 | 237 | 3 |
| `(field)` | 4 | 0 | 4 | 1 |
| `(guest)` (stay token + demo) | 27 | 0 | 27 | 0 |
| `(investor-portal)` | 18 | 0 | 18 | 0 |
| `(owner)` (owner portal) | 19 | 0 | 19 | 0 |
| `(platform-app)` (SubscriptionOS) | 6 | 0 | 6 | 0 |
| `(public)` (marketing + book + legal) | 25 | 2 | 23 | 0 |
| `(vendor)` | 2 | 0 | 2 | 0 |
| **Total** | **637** | **18** | **592** | **29** |

### Top 5 priority fixes (links to §7)

1. Duplicate site chrome on `/products/management-os` + `/products/development-os` (PublicHeader+PublicFooter wraps the page that already renders MgmtNav/MgmtFooter and DevNav/DevFooter) — 1 page each, two nav bars + two footers rendered. See §7.1.
2. Cabinet header action buttons that are inert `<button>` elements with no `onClick` / `action` / `disabled` — e.g. "Export brief", "Daily digest PDF ↓", "Tax pack PDF ↓", "+ Journal entry". See §4 and §7.2.
3. Visual fidelity drift: 18 NEW pages live alongside ~580 OLD pages — owner portal, investor portal, field, guest, buyer, vendor and ~95% of Mgmt OS admin pages still use `PageHeader` + `Section` + `Table` from the pre-Claude-Design `@/components/ui/*` family. See §2 and §7.3.
4. 9 Dev OS cabinet pages stubbed as visual ports with mock arrays; per `docs/audits/task-6-7-data-wiring-todo.md` site-supervisor + AI agents still partial (voice notes, QA, safety, runs telemetry). See §6 and §7.4.
5. 24 dashboard stub redirects under `/dashboard/{cfo-accountant,project-manager,qs,sales-manager,procurement-manager,marketing-staff,site-supervisor,warehouse-manager}` — 8 LOC each, likely simple `redirect()` to the `/development-os/cabinets/*` equivalents that exist on the Dev OS side. They should either resolve or be removed from sitemap. See §7.5.

### Build state

HF-16 (committed 472307d) tuned next.config for the 8GB Vercel container; audit infra (RELIABILITY-1) shows `npm run audit:runtime-config` 3/3. No HALT-state files observed. `_handoff/` package is the authoritative visual source per current memory (Tasks 1-7 visual + Task 9 motion shipped). Tasks 6/7 data wiring partially shipped (TASK-7-DATA-PART-1 / PART-2 / PART-3 commits).

---

## 2. Route inventory

> **Sampling method**: visual class for the 637 routes is inferred via two signals — (a) import of `@/components/dashboard/primitives` (NEW); (b) import of `@/components/ui/{page-header,section,table}` (OLD). Spot samples of `head -8` taken on ~25 representative files across every group plus all 18 NEW-class files. The remainder is inferred from import grep counts in each tree: 587 files in `src/app` import `@/components/ui/*` and 16 import `@/components/dashboard/primitives`. Visual class for routes that import neither (rare — typically pure-token `prose` content like `/legal/terms`) is marked "HYBRID/Token-only".

### 2.1 `(auth)` — 6 routes

| Path | LOC | Visual | Functional | Data | Notes |
|---|---:|---|---|---|---|
| `/login` | 192 | OLD (Logo + tokens, no PageHeader; bespoke) | LIVE | Supabase auth + product-aware quick links | Multi-product card layout (mgmt / dev / both) |
| `/setup/admin-bootstrap` | 88 | OLD | LIVE | First-admin bootstrap | |
| `/setup/mfa` | 27 | OLD (stub) | REDIRECT | — | Redirects to /setup/mfa/verify |
| `/setup/mfa/recovery-codes` | 84 | OLD | LIVE | MFA recovery flow | |
| `/setup/mfa/verify` | 138 | OLD | LIVE | MFA challenge | |
| `/sign-up` | 119 | OLD | LIVE | Drizzle: `subscriptionPlans` | Stage 7.E onboarding wizard |

### 2.2 `(buyer-portal)` — 6 routes

| Path | LOC | Visual | Functional | Data | Notes |
|---|---:|---|---|---|---|
| `/buyer-portal` | 5 | EMPTY | REDIRECT | — | Hard redirect to /buyer-portal/dashboard |
| `/buyer-portal/login` | 56 | OLD | LIVE | Magic-link auth | |
| `/buyer-portal/dashboard` | 156 | OLD (BuyerShell) | LIVE | buyer-portal queries | |
| `/buyer-portal/units` | 88 | OLD | LIVE | Drizzle direct | |
| `/buyer-portal/reports` | 102 | OLD | LIVE | reportsListService | |
| `/buyer-portal/reports/[id]` | 134 | OLD | LIVE | report detail | |

### 2.3 `(dashboard)` — Management OS admin · 274 routes

The single largest, most heterogeneous group. Only **6 pages** in this tree use Claude Design primitives (the cabinet ports from TASK-6-VISUAL/TASK-6-DATA). Every other page is OLD-visual.

#### 2.3.1 Cabinets (Claude Design — NEW)

| Path | LOC | Visual | Functional | Data | Notes |
|---|---:|---|---|---|---|
| `/dashboard` | 687 | NEW | LIVE | `getLiveDashboardCounts`, `getPortfolioMetrics`, `getRevenueByChannel`, `getMonthlyRevenueStrip`, `getOwnersYtdPayouts`, `getPortfolioProjects`, `getTodaySchedule`, `getCurrentStatementNudge` | Overview cabinet · TASK-6-DATA |
| `/dashboard/ai` | 244 | NEW | LIVE | AI hub queries | TASK-6-DATA |
| `/dashboard/bookings` | 465 | NEW | LIVE | bookings cabinet queries | TASK-6-DATA |
| `/dashboard/concierge` | 374 | NEW | LIVE | concierge queries | TASK-6-DATA |
| `/dashboard/finance` | 453 | NEW | LIVE | `listOwnerStatementsLive`, `getFinanceKpis`, `getPayoutsQueue` | TASK-6-DATA Statements cabinet |
| `/dashboard/operations` | 417 | NEW | LIVE | operations queries | TASK-6-DATA |

#### 2.3.2 Dashboard stub redirects (8 LOC each) — 7 pages

These are explicit Dev-OS cabinet aliases living inside the Mgmt-OS admin tree.

| Path | LOC | Visual | Functional | Notes |
|---|---:|---|---|---|
| `/dashboard/cfo-accountant` | 17 | EMPTY | REDIRECT | likely redirects to /development-os/cabinets/cfo-accountant |
| `/dashboard/project-manager` | 8 | EMPTY | REDIRECT | mirror |
| `/dashboard/qs` | 8 | EMPTY | REDIRECT | mirror |
| `/dashboard/sales-manager` | 8 | EMPTY | REDIRECT | mirror |
| `/dashboard/procurement-manager` | 8 | EMPTY | REDIRECT | mirror |
| `/dashboard/marketing-staff` | 8 | EMPTY | REDIRECT | mirror |
| `/dashboard/site-supervisor` | 8 | EMPTY | REDIRECT | mirror |
| `/dashboard/warehouse-manager` | 8 | EMPTY | REDIRECT | mirror |

#### 2.3.3 Large OLD-visual dashboard pages (LOC > 250)

These are functionally rich but visually pre-Claude-Design. Sampled imports: all use `PageHeader` + `Section` + (often) `Table` from `@/components/ui/*`. Candidates for VISUAL-FIDELITY-2 enrichment.

| Path | LOC | Visual | Functional | Notes |
|---|---:|---|---|---|
| `/dashboard/security` | 500 | OLD (uses `@/components/ui/primitives` DashboardKpi — hybrid leaning OLD) | LIVE | Security event KPIs |
| `/dashboard/guest-ai/handoffs/[id]` | 499 | OLD | LIVE | Handoff detail |
| `/dashboard/front-office` | 497 | OLD | LIVE | Arrivals/departures hub |
| `/dashboard/housekeeping` | 480 | OLD | LIVE | Today's clean roster |
| `/dashboard/direct-bookings/requests/[id]` | 375 | OLD | LIVE | DB request detail |

#### 2.3.4 Mid-size OLD dashboard pages (100-250 LOC) — ~70 routes

Most everyday admin surfaces — bookings list/detail/edit, finance sub-pages (expenses, fees, payouts, periods, reserves, revenue, statements, taxes, transparency), villa-guides, integrations, inventory, owner-intelligence, payments, pricing, procurement, security, settings, service-fulfilment, utilities. All use `PageHeader` + `Section` (+ often `Table`).

#### 2.3.5 Small OLD dashboard pages (30-100 LOC) — ~170 routes

Mostly forms (`new` routes), short detail pages, and list pages that defer to client components (drag-drop calendars etc.). All OLD-visual.

#### 2.3.6 Sub-30 LOC (form/empty stubs) — 24 routes

The 24 dashboard stubs include the 7 cabinet-mirror redirects above plus 17 `new` forms that lean entirely on a single `<NewXForm/>` client component:

| Path | LOC |
|---|---:|
| `/dashboard/projects/new` | 23 |
| `/dashboard/owners/new` | 22 |
| `/dashboard/documents/new` | 22 |
| `/dashboard/channels/new` | 23 |
| `/dashboard/guests/new` | 23 |
| `/dashboard/owner-stays/equivalence-groups/new` | 24 |
| `/dashboard/operations/housekeeping/[id]` | 12 |
| `/dashboard/guest-journey/rules/new` | 25 |
| `/dashboard/inventory/suppliers/new` | 23 |
| `/dashboard/inventory/counts/new` | 28 |
| `/dashboard/inventory/stock/page.tsx` | 25 |
| `/dashboard/service-fulfilment/vendors/new` | 25 |
| `/dashboard/availability/blocks/new` | 29 |
| `/dashboard/finance/payouts/new` | 24 |
| `/dashboard/maintenance-intelligence/templates/new` | 21 |
| `/dashboard/pricing/rule-sets/new` | 25 |

Treat as legitimate thin servers; not stubs.

### 2.4 `(development-app)` — Development OS admin · 250 routes

#### 2.4.1 Dev OS cabinets + overview (Claude Design — NEW)

| Path | LOC | Visual | Functional | Data | Notes |
|---|---:|---|---|---|---|
| `/development-os` | 413 | NEW | LIVE | `getActiveProjectsRollup`, `getTeamRoster`, `getLatestQsAnomaly`, `getRiskRadar`, `getSiteActivityFeed`, `getDevPortfolioKpis` | TASK-7-DATA-PART-2 / PART-3 |
| `/development-os/cabinets/cfo-accountant` | 420 | NEW | LIVE | `getCfoKpis`, `getPnlByProject`, `getCashStrip6Week`, `getActiveTaxTypes`, `getSharedCostsBreakdown` | TASK-7-DATA-PART-1 |
| `/development-os/cabinets/procurement-manager` | ~340 | NEW | LIVE | `listOpenPurchaseRequests`, `listPosInTransit`, `listInvoicesAwaitingApproval` | TASK-7-DATA-PART-1 · empty-state friendly |
| `/development-os/cabinets/project-manager` | 402 | NEW | LIVE | partial PM KPIs | TASK-7-DATA-PART-3 |
| `/development-os/cabinets/qs` | ~310 | NEW | LIVE | BOQ + RFQ services | TASK-7-DATA-PART-2 |
| `/development-os/cabinets/site-supervisor` | ~290 | NEW | LIVE (PARTIAL) | site reports + photos live; voice/QA/safety stubbed | TASK-7-DATA-PART-2 (🟡 partial) |
| `/development-os/cabinets/sales-manager` | 470 | NEW | MOCK | Mocked arrays per landing prototype | TASK-7-VISUAL only · no data wiring yet |
| `/development-os/cabinets/marketing-staff` | 445 | NEW | MOCK | Mocked | TASK-7-VISUAL only |
| `/development-os/cabinets/warehouse-manager` | 374 | NEW | MOCK | Mocked | TASK-7-VISUAL only |
| `/development-os/cabinets/my-cabinet` | 13 | EMPTY | REDIRECT | — | role redirect |
| `/development-os/cfo` | ~360 | NEW | MOCK | TASK-8-MISSING-ROUTES 1/9 (commit 534697a) | mock — wiring to dev_transactions follow-up |
| `/development-os/warehouse` | ~340 | NEW | LIVE | SKU + category KPIs from `dev_os_inventory_items` (40 seeded) · deliveries-today mock | TASK-8-MISSING-ROUTES 2/9 |
| `/development-os/marketing` | ~280 | NEW | MOCK | TASK-8-MISSING-ROUTES 3/9 | mock — wiring follow-up |
| `/development-os/ai-agents` | 332 | NEW | LIVE | `getDevAgentConfigs`, `getRecentAgentOutputs`, `getDevAiKpis` | TASK-7-DATA-PART-2 (🟡 KPIs partial) |

#### 2.4.2 Dev OS leaf admin pages (OLD-visual, mostly LIVE)

The remaining ~235 pages under `(development-app)` use OLD primitives. Functional breakdown:

| Cluster | Routes | LOC range | Functional | Notes |
|---|---:|---|---|---|
| `/development-os/projects/[slug]/*` (schedule, risks, decisions, work-packages, change-orders, permits, waterfall, land, company) | ~30 | 80-400 | LIVE | Project hub — well populated; DEMO-2 seeds support |
| `/development-os/finance/*` (transactions, invoices, budget, periods, FX, reconciliation, document-extractions, shared-costs, tax-reports, bank-accounts, statement-import) | ~40 | 70-380 | LIVE | Bookkeeper surface — HF-7/HF-8/HF-11/AI-ACTIVATION-1 fixes anchored here |
| `/development-os/procurement/*` (PRs, quotations, comparison) | ~10 | 80-260 | LIVE | DEMO-2 partially seeded |
| `/development-os/inventory/*` (items, movements, locations, stocktake) | ~10 | 80-280 | LIVE | dev_os_inventory_items 40 seeded |
| `/development-os/site-reports/*`, `/safety/*`, `/qa-qc/*` | ~10 | 50-515 | LIVE / STUB | Voice notes / QA / safety follow-up to DEMO-3 schema |
| `/development-os/marketing/*` (campaigns, content, conversations, leads, attribution) | ~25 | 60-300 | LIVE | TASK-MD-* lineage |
| `/development-os/ai-agents/*` (8 agents × {page, outputs/[code]}) | ~18 | 80-300 | LIVE | Agent registry + outputs |
| `/development-os/sales/*`, `/buyers/*`, `/vendors/*`, `/contracts/*`, `/commitments/*` | ~15 | 70-250 | LIVE | Sales pipeline |
| `/development-os/reports/*` (8 report pages) | 9 | 70-200 | LIVE | Budget-burn, S-curve, etc. |
| `/development-os/schedule/*`, `/development-os/discounts`, `/development-os/cashflow-forecast`, `/development-os/profitability`, `/development-os/productivity*`, `/development-os/residual-inventory*`, `/development-os/revenue-streams`, `/development-os/risk-radar*`, `/development-os/digests*` | ~25 | 70-360 | LIVE | Misc admin |
| `/development-os/platform/*` (5 routes) | 5 | 100-300 | LIVE | Super-admin platform-org tools |
| `/development-os/settings/*` (12 routes) | 12 | 60-512 | LIVE | AI usage, API keys, approvals, notifications, users-roles, webhooks, whatsapp |
| `/development-os/inbox/*`, `/whatsapp/*` | 7 | 60-200 | LIVE | Channels |
| Dev-OS stubs (<30 LOC) | 3 | 5-13 | STUB/REDIRECT | `/development-os/inventory` (5), `/development-os/procurement` (5), `/development-os/cabinets/my-cabinet` (13) |

### 2.5 `(field)` — 4 routes

| Path | LOC | Visual | Functional | Data | Notes |
|---|---:|---|---|---|---|
| `/field` | 430 | OLD (MobileTaskCard custom) | LIVE | `listTasksForCurrentStaff`, `listCurrentReadiness` | |
| `/field/inventory` | 14 | OLD | LIVE | `listInventoryItems` | |
| `/field/tasks/[id]` | 257 | OLD | LIVE | tasks detail | |
| `/field/tasks/demo` | 23 | OLD | STUB | mock | Demo-only |

### 2.6 `(guest)` — Guest stay + demo · 27 routes

All 27 routes use `GuestShell` + `@/components/ui/*` (OLD-visual). Stay-token and stay-demo trees are mirror images.

| Sub-tree | Routes | LOC range | Functional | Notes |
|---|---:|---|---|---|
| `/stay/[token]/*` (real token) | 14 | 30-358 | LIVE | check-in, concierge, emergency, guide, house-rules, neighborhood, offline, wifi, requests, services |
| `/stay/demo/*` | 13 | 70-280 | MOCK | Same surface, demo content |

### 2.7 `(investor-portal)` — 18 routes

| Path | LOC | Visual | Functional | Notes |
|---|---:|---|---|---|
| `/investor-portal` | 247 | OLD | LIVE | dashboard — main entry · uses Button/Badge/Section from ui |
| `/investor-portal/dashboard` | 169 | OLD | LIVE | alt dashboard via investor session |
| `/investor-portal/capital` | 99 | OLD | LIVE | capital ledger; reads DEMO-3-INVESTOR seeds |
| `/investor-portal/commitments` | 72 | OLD | LIVE | |
| `/investor-portal/commitments/[id]` | 184 | OLD | LIVE | |
| `/investor-portal/construction` | 130 | OLD | LIVE | progress per project |
| `/investor-portal/distributions` | 92 | OLD | LIVE | DEMO-3-INVESTOR (4 distributions) |
| `/investor-portal/distributions/[id]` | 178 | OLD | LIVE | |
| `/investor-portal/documents` | 64 | OLD | STUB | Storage-1 follow-up |
| `/investor-portal/forecasts` | 112 | OLD | LIVE | |
| `/investor-portal/login` | 80 | OLD | LIVE | magic link |
| `/investor-portal/nav` | 56 | OLD | LIVE | NAV series — depends on investor_nav_snapshots (24 seeded DEMO-3) |
| `/investor-portal/profile` | 92 | OLD | LIVE | |
| `/investor-portal/q4-brief` | 130 | OLD | STUB | Q-BRIEF-1 sprint — operator-authored narrative not yet wired |
| `/investor-portal/requests` | 88 | OLD | LIVE | investor requests |
| `/investor-portal/wallet/[commitmentId]` | 144 | OLD | LIVE | wallet detail · investor_wallets seeded DEMO-3-INVESTOR |
| `/investor-portal/wallet/reinvest` | 132 | OLD | STUB | needs wallet_transactions (INVESTOR-2) |
| `/investor-portal/wallet/withdraw` | 124 | OLD | STUB | needs wallet_transactions + PAYOUT-1 |

### 2.8 `(owner)` — 19 routes

All OLD-visual (`PageHeader` + `Section` + `Button` from `@/components/ui/*`). Owner portal is fully functional but visually drifted from the cabinet primitives.

| Path | LOC | Visual | Functional | Notes |
|---|---:|---|---|---|
| `/owner` | 370 | OLD | LIVE | `getOwnerDashboardKpis`, `getTwelveMonthNetSeries`, `listMyStatements`, `listMyVillas`, `getOwnerStayQuota` |
| `/owner/bookings` | 156 | OLD | LIVE | |
| `/owner/bookings/[id]` | 184 | OLD | LIVE | |
| `/owner/calendar` | 92 | OLD | LIVE | |
| `/owner/distributions` | 88 | OLD | LIVE | |
| `/owner/documents` | 76 | OLD | STUB | needs storage |
| `/owner/inbox` | 124 | OLD | LIVE | |
| `/owner/preferences/calendar` | 148 | OLD | LIVE | |
| `/owner/revenue` | 192 | OLD | LIVE | |
| `/owner/statements` | 102 | OLD | LIVE | STATEMENT-1 seed (4 periods) |
| `/owner/statements/[id]` | 304 | OLD | LIVE | |
| `/owner/stays` | 84 | OLD | LIVE | |
| `/owner/stays/new` | 130 | OLD | LIVE | |
| `/owner/stays/[id]` | 156 | OLD | LIVE | |
| `/owner/villas` | 132 | OLD | LIVE | |
| `/owner/villas/[id]/calendar` | 100 | OLD | LIVE | |
| `/owner/villas/[id]/health` | 124 | OLD | LIVE | |
| `/owner/villas/[id]/revenue` | 144 | OLD | LIVE | |
| `/owner/villas/[id]/timeline` | 96 | OLD | LIVE | |

### 2.9 `(platform-app)` — 6 routes

All OLD-visual; super-admin scoped.

| Path | LOC | Visual | Functional | Notes |
|---|---:|---|---|---|
| `/platform` | 96 | OLD | LIVE | SubscriptionOS placeholder landing |
| `/platform/organizations` | 132 | OLD | LIVE | All customer orgs |
| `/platform/[orgCode]` | 224 | OLD | LIVE | per-org admin |
| `/platform/audit` | 78 | OLD | LIVE | |
| `/platform/revenue` | 92 | OLD | LIVE | |
| `/platform/usage` | 88 | OLD | LIVE | |

### 2.10 `(public)` — 25 routes

| Path | LOC | Visual | Functional | Notes |
|---|---:|---|---|---|
| `/` | 134 | HYBRID (token-only, `ProductLanding` + `ApexPicker` + `SubscriptionLanding`) | LIVE | umbrella picker; middleware can short-circuit to product apex |
| `/products/management-os` | **1993** | NEW (`data-product="management"`) | LIVE/STUB | TASK-3 visual port; internal nav + footer. Outbound links per §5 |
| `/products/development-os` | **2385** | NEW (`data-product="development"`) | LIVE/STUB | TASK-7 visual port; internal nav + footer. Outbound links per §5 |
| `/legal/terms` | 36 | OLD (prose-only, no PageHeader) | STUB | Placeholder copy; "full terms before GA" |
| `/legal/privacy` | 36 | OLD (prose-only) | STUB | Placeholder copy |
| `/pricing` | 320 | OLD (custom gradient hero, no PageHeader) | LIVE | reads `PRICING_PLANS` |
| `/signup` | 78 | OLD (bespoke hero) | LIVE | SignupForm client island |
| `/case-studies` | 184 | OLD | LIVE | Sprint 17 case study engine |
| `/contact` | 86 | OLD | LIVE | |
| `/portfolio` | 132 | OLD | LIVE | |
| `/features/management-os` | 174 | OLD | LIVE | Sprint LD-2 |
| `/features/development-os` | 186 | OLD | LIVE | |
| `/guest-experience` | 124 | OLD | LIVE | |
| `/investor-reporting` | 130 | OLD | LIVE | |
| `/operations` | 116 | OLD | LIVE | |
| `/owner-portal` | 138 | OLD | LIVE | |
| `/no-product-access` | 64 | OLD | LIVE | error route |
| `/accept-invitation/[token]` | 192 | OLD | LIVE | |
| `/book/hold/[token]` | 248 | OLD | LIVE | direct-booking hold |
| `/book/hold/[token]/cancelled` | 72 | OLD | LIVE | |
| `/book/hold/[token]/expired` | 78 | OLD | LIVE | |
| `/book/hold/[token]/messages` | 184 | OLD | LIVE | |
| `/book/hold/[token]/payment` | 280 | OLD | LIVE | |
| `/book/hold/[token]/status` | 357 | OLD | LIVE | |
| `/book/hold/[token]/submitted` | 96 | OLD | LIVE | |

### 2.11 `(vendor)` — 2 routes

| Path | LOC | Visual | Functional | Notes |
|---|---:|---|---|---|
| `/vendor/service/[token]` | 128 | OLD | LIVE | token-scoped vendor service view |
| `/vendor/service/[token]/invoice` | 102 | OLD | LIVE | |

---

## 3. Visual chrome (landings + auth)

| Surface | Visual | Layout chrome | Issues |
|---|---|---|---|
| `/` | HYBRID — token-only via `ProductLanding` | `(public)/layout.tsx` → `PublicHeader` + `PublicFooter` | Clean — single nav/footer |
| `/products/management-os` | NEW — `data-product="management"` | `(public)/layout.tsx` wraps with `PublicHeader` + `PublicFooter`, then the page renders its own `<MgmtNav />` and `<MgmtFooter />` | **DUPLICATE chrome** — two nav bars, two footers visible per page render |
| `/products/development-os` | NEW — `data-product="development"` | Same pattern: `PublicHeader/Footer` from layout + in-file `<DevNav />` and `<DevFooter />` | **DUPLICATE chrome** — same issue |
| `/login` | OLD (custom hero card) | No `(public)` layout — `(auth)` is its own group with no header/footer wrapper | Clean |
| `/sign-up` (auth) | OLD | `(auth)` group | Clean |
| `/signup` (public) | OLD (bespoke) | `(public)` layout → PublicHeader + PublicFooter | Clean |
| `/legal/terms` | OLD (prose-only) | `(public)` layout | Clean |
| `/legal/privacy` | OLD (prose-only) | `(public)` layout | Clean |
| `/pricing` | OLD (bespoke gradient hero) | `(public)` layout | Clean |

Footer/nav components verified:
- `src/components/layout/public-footer.tsx` — always renders; group-link list with "Products / Resources / Access".
- `src/components/layout/public-header.tsx` — `"use client"`; sticky; reads `marketingNav` from `@/config/navigation`. No conditional based on `pathname.startsWith("/products/")`.
- Inside `(public)/products/management-os/page.tsx`: `function MgmtNav()` and `function MgmtFooter()` rendered unconditionally. Same for Dev OS landing.

The product apex landing flow is documented as "for apex traffic hitting `/products/management-os` directly, force `data-product` attribute via the `<div>` wrapper" — but the prototype's intent of a single product-themed nav+footer is broken by the un-conditional `PublicHeader/Footer` in the route-group layout.

**Recommended fix**: either (a) move `PublicHeader/Footer` to a `(public)/(marketing)/layout.tsx` that excludes `/products/*`, or (b) in `PublicHeader/Footer`, check `pathname.startsWith("/products/")` and return `null`.

---

## 4. Cabinet button audit

Six representative cabinets. The `SectionHeading.actions` slot is the primary place where the prototype's CTA buttons live.

### 4.1 `/dashboard` (Mgmt OS overview)

| Label | Target | Status |
|---|---|---|
| "Export brief" | `<button>` (no `onClick`, no `action`) | **no-op** — visual only |
| "New booking +" | `<Link href="/dashboard/bookings">` | works (navigates to list, not New form — possible intent miss) |

### 4.2 `/dashboard/finance` (Statements cabinet)

| Label | Target | Status |
|---|---|---|
| (per-statement) "Approve" | `<form action={approveStatement}>` submit button | works — server action |
| (per-statement) "Mark sent" | `<form action={markStatementSent}>` submit button | works — server action |
| `<select name="period">` then "Generate all" | `<form action={generateForPeriodAction}>` submit | works — server action; iterates owners×villas for selected period |

This is the most fully-wired cabinet header on the platform. Reference implementation.

### 4.3 `/development-os` (Dev OS overview)

| Label | Target | Status |
|---|---|---|
| "Daily digest PDF ↓" | `<button>` (no `onClick`) | **no-op** |
| "New project +" | `<Link href="/development-os/projects/new">` | works |

### 4.4 `/development-os/cabinets/cfo-accountant`

| Label | Target | Status |
|---|---|---|
| "Tax pack PDF ↓" | `<button>` (no `onClick`) | **no-op** |
| "+ Journal entry" | `<button>` (no `onClick`) | **no-op** — intended target probably `/development-os/finance/transactions/quick-entry` |

### 4.5 `/owner` (Owner home)

| Label | Target | Status |
|---|---|---|
| "Download PDF" | `<Button asChild><Link href={`/api/finance/statements/${id}/pdf`} target="_blank">` | works — uses real API route |
| "View statements" | `<Button asChild><Link href="/owner/statements">` | works |
| "All statements →" | `<Link href="/owner/statements">` | works |
| "Download PDF" (in card) | `<Link href={`/api/finance/statements/${id}/pdf`}>` | works |
| "Distributions →" | `<Link href="/owner/distributions">` | works (lands on STUB; see §2.8) |
| "All villas" | `<Link href="/owner/villas">` | works |

Owner home button wiring is the cleanest example — uses `Button asChild` + real API endpoints.

### 4.6 `/investor-portal` (Investor home)

| Label | Target | Status |
|---|---|---|
| (header) "View Q4 brief →" | `<Link href="/investor-portal/q4-brief">` | works but lands on STUB (Q-BRIEF-1) |
| "Full ledger →" | `<Link href="/investor-portal/capital">` | works |
| "Construction →" | `<Link href="/investor-portal/construction">` | works |
| "Full view →" | `<Link href="/investor-portal/construction">` | works |

### Pattern observed

Mgmt/Dev cabinets ported in TASK-6-VISUAL / TASK-7-VISUAL preserve the prototype's `<button class="btn btn-secondary btn-sm">` HTML but **do not wire onClick handlers or server actions** for non-link CTAs ("Export brief", "Daily digest PDF ↓", "Tax pack PDF ↓", "+ Journal entry"). These appear active to the user but do nothing on click. The Owner Portal — which was not ported in the TASK-6 visual sprint and stayed on `Button` from `@/components/ui/*` — is paradoxically the better-wired surface because the `<Button asChild>` pattern forces every CTA through a real `<Link>` or form.

---

## 5. Outbound landing links

### 5.1 `/products/management-os` outbound links

| Link text (inferred) | href | Target route exists | Target visual |
|---|---|---|---|
| Nav: "Sign in" | `/login` | yes | OLD (bespoke auth) |
| Nav/Hero: "Start free trial" | `/signup` | yes (`(public)/signup`) | OLD |
| Hero: "Open admin demo" | `/dashboard` | yes | NEW |
| "Owner view" / "Open owner demo" | `/owner` | yes | OLD |
| "Try the AI hub" | `/dashboard/ai` | yes | NEW |
| Pricing-section anchor | `#top` (in-page) | n/a | self |

### 5.2 `/products/development-os` outbound links

| Link text (inferred) | href | Target route exists | Target visual |
|---|---|---|---|
| Nav: "Sign in" | `/login` | yes | OLD |
| Nav/Hero: "Get started" | `/signup` | yes | OLD |
| Hero: "Open the Dev OS demo" | `/development-os` | yes | NEW |
| "Open QS / BOQ cabinet" | `/development-os/cabinets/qs` | yes | NEW |
| "Open Investor portal" | `/investor-portal/dashboard` | yes | OLD |
| Section anchor | `#platform` | n/a | self |

All targets exist on the filesystem. Mismatch — every landing CTA promises a Claude-Design cabinet, but the supporting surfaces a buyer would visit immediately after (Owner portal, Investor portal, Signup) are still OLD-visual. A buyer flows from Claude-Design landing → OLD-visual product. Likely the highest-impact visual debt for marketing fidelity.

---

## 6. Schema + seed inventory snapshot

Inferred from seed scripts (header comments + INSERT counts). Live row counts not verified against the database in this audit (would require `scripts/check-demo2-counts.ts` run; flagged as follow-up).

| Seed sprint | Tables touched | Approx rows | Notes |
|---|---|---:|---|
| **DEMO-1** (`scripts/seed-arconique-demo.ts`) | projects, cost_categories, bank_accounts, vendors, transactions, ai agent enablements | ~200 | XLSX-driven from `docs/reference/arconique-real-data-sample.xlsx`. Idempotent via DEMO- prefix |
| **DEMO-2** (`scripts/seed-arconique-demo-2.ts`) | villas, owners, channels, guests, investors (8), maintenance templates, materials (8 categories × names), risks | ~600 | Idempotent via DEMO2- prefix |
| **DEMO-3** (`scripts/seed-arconique-demo-3.ts`) | voice_notes (30), qa_qc_issues + inspections (~40), safety_incidents (7), investor_nav_snapshots (24 = 4 projects × 6 quarters) | ~100 | Documents / site_report_photos / commitments / drawdowns / rate_plans / channel_sync_state explicitly deferred — STORAGE-1 / INVESTOR-1 / BOOKING-PRICING-1 / CHANNEL-1 |
| **DEMO-3-INVESTOR** (`scripts/seed-arconique-demo-3-investor.ts`) | capital_commitments (32 = 8 investors × 4 projects), capital_drawdowns (~80), distributions (4), investor_wallets (32) | ~150 | Skipped: distribution_allocations, wallet_transactions (INVESTOR-2 follow-up) |
| **STATEMENT-1** (`scripts/seed-statements.ts`) | statement_periods, owner_statements | 4 periods × N owners×villas | Real statement generation; HF-7 seed |
| **AUTH-OWNER-1** (`scripts/seed-auth-owner-grants.ts`) | Supabase Auth users + app_users + app_users_owners grants for every DEMO-2 owner | per DEMO-2 owner count | Demo passwords `ArcOwner-2026-…` |
| **AUTH-INVESTOR-1** (`scripts/seed-auth-investor-grants.ts`) | Supabase Auth users + app_users + grants for every DEMO-2 investor | 8 | Demo passwords `ArcInv-2026-…` |

### Likely-empty tables that downstream UI references

| Table | UI that needs it | Sprint |
|---|---|---|
| `documents` | /owner/documents, /investor-portal/documents | STORAGE-1 |
| `site_report_photos` | /investor-portal/construction galleries | STORAGE-1-WIRE-PHOTOS |
| `distribution_allocations` | per-investor distribution share | INVESTOR-2 |
| `wallet_transactions` | /investor-portal/wallet/{reinvest,withdraw} | INVESTOR-2 |
| `rate_plans` | /dashboard/pricing/* | BOOKING-PRICING-1 |
| `channel_sync_state` | /dashboard/channels | CHANNEL-1 |
| `ai_runs` telemetry | /development-os/ai-agents KPIs (runs/latency/tokens) | TASK-7-DATA-PART-3 |
| material_deliveries | /development-os/warehouse "deliveries today" | DEMO-3-WAREHOUSE |
| `voice_notes` transcription queue | /development-os/cabinets/site-supervisor voice panel | TASK-7-DATA-PART-3 |

---

## 7. Priority fix list

Ranked by leverage (visible-to-user impact per engineering hour). Effort estimates assume one senior engineer familiar with the codebase.

### 7.1 Fix duplicate site chrome on product landings — **½ day**

**Why**: `/products/management-os` and `/products/development-os` are the two highest-traffic marketing pages and each renders two `<header>` and two `<footer>` elements (PublicHeader+PublicFooter from `(public)/layout.tsx` plus MgmtNav/MgmtFooter or DevNav/DevFooter from the page itself). This is visible-on-load brand damage.

**Files**:
- `src/components/layout/public-header.tsx` — add `if (pathname.startsWith("/products/")) return null;`
- `src/components/layout/public-footer.tsx` — same conditional (will need to convert to `"use client"` or split into header/footer pair)
- Alternative: introduce `src/app/(public)/products/layout.tsx` that omits PublicHeader/Footer

### 7.2 Wire inert cabinet CTAs — **1 day**

**Why**: Every NEW-visual cabinet ships header buttons that look interactive but do nothing. Erodes trust in the demo flow.

**Affected**:
- `/dashboard` — "Export brief"
- `/development-os` — "Daily digest PDF ↓"
- `/development-os/cabinets/cfo-accountant` — "Tax pack PDF ↓", "+ Journal entry"
- (likely similar) `/development-os/cabinets/{qs,procurement-manager,project-manager,sales-manager,marketing-staff,site-supervisor,warehouse-manager}` — needs sweep

**Approach**: for each button, either (a) wire to a real route (`+ Journal entry` → `/development-os/finance/transactions/quick-entry`), (b) wire to a real PDF endpoint (`/api/finance/.../pdf`), (c) replace with `disabled` + "Coming with EMAIL-1 / PDF-1" tooltip, or (d) delete.

### 7.3 Visual fidelity sweep on owner + investor portals — **2+ days**

**Why**: Outbound landing CTAs flow into OLD-visual surfaces. Owner portal (19 pages) and Investor portal (18 pages) are the two highest-conversion post-signup surfaces.

**Approach**: port `/owner` and `/investor-portal` to Claude Design primitives (`Kpi` + `SectionHeading` + `Card` from `@/components/dashboard/primitives`). Sub-routes can follow in a later sprint.

**Affected**: 37 pages. Estimate ½ day per page if mechanical; cluster into a single VISUAL-FIDELITY-2 sprint.

### 7.4 Finish Dev OS cabinet data wiring — **2 days**

**Why**: 3 of 9 cabinets ported in TASK-8-MISSING-ROUTES still on mock arrays (`/development-os/cfo`, `/development-os/marketing`); site-supervisor + ai-agents partial KPIs; sales-manager + marketing-staff + warehouse-manager cabinets (TASK-7-VISUAL only) never wired.

**Affected**:
- `src/app/(development-app)/development-os/cfo/page.tsx`
- `src/app/(development-app)/development-os/marketing/page.tsx`
- `src/app/(development-app)/development-os/cabinets/{sales-manager,marketing-staff,warehouse-manager,site-supervisor,ai-agents}/page.tsx`

Per `docs/audits/task-6-7-data-wiring-todo.md` the remaining ~5.5 senior-eng days of TASK-6/7 data work is identified line-by-line.

### 7.5 Resolve dashboard cabinet-mirror redirects — **½ day**

**Why**: 8 stubs under `/dashboard/{cfo-accountant,project-manager,qs,sales-manager,procurement-manager,marketing-staff,site-supervisor,warehouse-manager}` of 8 LOC each. They either redirect to `/development-os/cabinets/*` or are vestigial — but they live in the Mgmt OS dashboard sidebar, which means a Mgmt-OS-only customer can click into a Dev-OS route they don't have access to.

**Approach**: confirm each is a redirect (probably) and remove from Mgmt OS sidebar nav.

**Affected files**:
- `src/app/(dashboard)/dashboard/cfo-accountant/page.tsx` (17 LOC) and 7 siblings (8 LOC each)
- `src/components/dashboard/sidebar.tsx` (verify nav entries)

### 7.6 Storage-1: photos + documents end-to-end — **2+ days**

**Why**: 4 routes are functionally STUB because no storage layer exists: `/owner/documents`, `/investor-portal/documents`, `/investor-portal/construction` galleries, `/development-os/cabinets/site-supervisor` photo panel. DEMO-3 explicitly deferred this.

**Approach**: provision Supabase Storage bucket(s), wire upload/list/signed-URL services, seed `documents` + `site_report_photos`.

### 7.7 Investor-2: ledger telemetry tables — **1 day**

**Why**: `/investor-portal/wallet/reinvest` and `/wallet/withdraw` are stubs because `wallet_transactions` is empty, and per-investor share calculation depends on `distribution_allocations`.

**Approach**: backfill seed for `distribution_allocations` (compute = commitment.amount × project.distribution_amount / project.total_committed) and `wallet_transactions` (append from drawdowns + distributions).

### 7.8 Email-1 cron UI — **1 day**

**Why**: `/dashboard/finance` subtitle explicitly references "Auto-send via the monthly cron will land with EMAIL-1." Statement-generation flow lacks the final scheduled-send step.

**Approach**: add per-org toggle for auto-send + cron preview.

### 7.9 Q-BRIEF-1: investor narrative — **1 day**

**Why**: `/investor-portal/q4-brief` is the prominent CTA from `/investor-portal` header, currently a STUB.

**Approach**: operator-authored quarterly narrative workflow (markdown editor + scheduled publish).

### 7.10 Lint cleanup — **½ day**

**Why**: 87 warnings noted in memory header; not blocking but obscures regressions.

**Approach**: `LINT-CLEANUP-2` mechanical pass.

---

## 8. Sprint catalog (for follow-up planning)

One-line summaries derived from `docs/audits/task-8-progress.md`, `docs/audits/task-6-7-data-wiring-todo.md`, and seed-script header comments.

| Sprint | One-line summary | Source doc |
|---|---|---|
| TASK-8-MISSING-ROUTES-2 | Create remaining 6 Dev OS routes (`/communications`, `/knowledge`, `/platform`, `/schedule`, `/settings`, `/strategic`) with mock data | `docs/audits/task-8-progress.md` |
| TASK-8-VISUAL-POLISH-1 | Enrich ~14 functional Mgmt OS pages with prototype's KPI strips + roll-up tables (start with `/dashboard/projects` from `_handoff/management/projects.html`) | `docs/audits/task-8-progress.md` |
| VISUAL-FIDELITY-2 | When prototypes land for owner / investor / public sub-pages, port to Claude Design primitives | new (this audit) |
| TASK-10 | Playwright baseline + Storybook visual regression after visual work complete | `docs/audits/task-8-progress.md` |
| LINT-CLEANUP-2 | 87 ESLint warnings mechanical cleanup | memory header |
| FX-CALLERS-2 | Thread `getUsdToIdr()` through display queries (multi-currency consistency) | flagged in memory |
| STORAGE-1-WIRE-PHOTOS | Site supervisor + investor construction galleries on Supabase Storage | `docs/audits/task-6-7-data-wiring-todo.md` (site supervisor partial) |
| EMAIL-1-CRON-UI | Per-org auto-send toggle for monthly statement cron | `/dashboard/finance` subtitle |
| DEMO-3-WAREHOUSE | Material delivery seed for warehouse "deliveries today" KPI | TASK-8-MISSING-ROUTES 2/9 header |
| INVESTOR-2 | `distribution_allocations` + `wallet_transactions` backfill | `scripts/seed-arconique-demo-3-investor.ts` header |
| PAYOUT-1 | Bank rail integration for `/investor-portal/wallet/withdraw` | implied by withdraw STUB |
| Q-BRIEF-1 | Operator-authored quarterly narrative workflow | `/investor-portal/q4-brief` STUB |
| AUTH-OWNER-1.5 | UI invite + reset password flows for AUTH-OWNER-1 grants | `scripts/seed-auth-owner-grants.ts` (demo password prefix) |
| AUTH-INVESTOR-1.5 | UI invite + reset password flows for AUTH-INVESTOR-1 grants | `scripts/seed-auth-investor-grants.ts` |
| TASK-7-DATA-PART-3 | Voice notes / QA / safety / AI telemetry — depends on schema | `docs/audits/task-6-7-data-wiring-todo.md` |
| HF-17+ | Future hotfix budget after HF-16 next.config tuning | implied |

---

## Methodology + caveats

- **Visual class** inferred from import grep only. False-positive risk: a file might import `@/components/dashboard/primitives` for one widget while keeping a `PageHeader` shell. Spot samples did not surface this, but a strict classification audit would `head -50` every file.
- **Functional class** inferred from import-of-services-layer plus path heuristics (`/new` → form, leaf `index` files → list). LIVE/MOCK distinction not verified against database rows. Where a seed-script header explicitly defers a table, the consuming UI was tagged STUB.
- **Buttons** in §4 were located via grep for `<Link href`, `<Button asChild`, `<button`. Inert `<button>` was distinguished by absence of `onClick`, `action`, `type="submit"`, or `disabled`.
- **Row counts** in §6 are seed-script declarations, not verified DB queries.
- Visual chrome duplication in §3 is confirmed by direct read of layout + page files; no rendering test was performed.

End of audit.
