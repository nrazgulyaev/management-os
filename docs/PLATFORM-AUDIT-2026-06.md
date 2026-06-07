# Arconique — Full Platform Audit & Improvement Roadmap (2026-06)

Three multi-agent audits, adversarially verified, merged here:
- **Functional review** — every menu item walked as its real persona; is it a *working tool* or a shell? Benchmarked vs best-in-class. (39 agents, 267 menu items.) → §D
- **Technical review** — security, data integrity, performance, testing, observability, AI, a11y, tech-debt. (58 agents, 99 findings → 36 confirmed-serious.) → §E
- **Action-verb audit** — every add/edit/delete/cancel/connect/disconnect traced control→handler→DB, with `file:line`. (25 agents, 676 action-cells.) → **§G**

> Benchmark matrices for **villa-management (Guesty/Hostaway), construction-PM (Procore/Fieldwire), AI-CRM (Agentforce/Fin/Attio), accounting (QuickBooks/Jurnal)** — see **§F** (incl. §F.5 Attio).

> **Corrections from the action-verb pass (§G) — read these against §A/§B:**
> - The OTA **channel-manager connection is real** (encrypted creds + live test + disconnect, in `/development-os/channels`); only **rate/availability push** is the simulated stub. Earlier "channels stubbed" framing was too broad.
> - **The biggest single gap is cheaper than thought:** 20% of all action-cells are *backend-built actions with no button* (the action does a real DB write but nothing in the UI calls it). A "wire-up sweep" beats new feature-building. (§G.2)
> - **Two trust/security bugs not in §E:** payment Wise/PayPal/Manual "Test connection" returns a **false-green** (DryRun always reports success), and payment/bank/marketing **credentials are stored plaintext** despite the UI claiming AES-256-GCM. (§G.3 Tier 2)
> - At the *verb* level the platform is **~58% operable**, vs the 65% screen-level number. (§G.1)

---

## A. Unified executive verdict

The platform is **architecturally mature and ~65% a real working tool** — far past "pretty shell" in the operational core (guest stays, front office, operations/field, housekeeping, owner statements, investor capital backbone, Management-OS procurement, site reports, safety, QA/QC). It is **not yet operable** for five specific roles, it ships through a **build that ignores TS+ESLint with near-zero observability**, and it has **one root multi-tenant flaw**.

Three things must happen, in this order of urgency:

1. **Close the security/correctness holes** (technical) — a handful are S-effort and genuinely dangerous: an **unauthenticated inventory-data leak** in the Field PWA, **SSRF** on calendar feeds, a job runner that reports **"success" while the DB is down**, and the **root tenancy gap** (`projects`/`villas` have no `organizationId`, so ~60 tables are only transitively scoped).
2. **Turn the disabled buttons on** (functional) — the most damaging pattern is the role *cabinet* that shows live KPIs but disables every action ("coming soon"): **Site Supervisor, Procurement Manager, Concierge, CFO/Accountant**. Plus kill the literal mocks (`/communications` "1820", `/operations/turnovers`, `/strategic`, `/cabinets/procurement-manager/pos`) and ship the two **missing buyer-portal routes** (payments + documents).
3. **Make the AI real** — the agent *chassis* is strong (CRUD, knowledge upload+RAG, telemetry, test chat, cost caps) but **14 of 35 agents are stubs** and **all 6 founder-named assistants don't exist yet** (supervisor-AI w/ WhatsApp+vision, daily-digest, autonomous concierge, real-estate-agent chatbot, Indonesia tax, materials planner). Build **one** real agent (daily-digest) as the template, then wire **inbound WhatsApp → concierge**.

**The single most important shift: stop building new surfaces; make the existing ones operable + safe.**

---

## B. Unified prioritized roadmap

### 🔴 P0 · Security/correctness — do this week (all small unless noted)
| Item | Why | Effort |
|---|---|---|
| Field PWA auth gate (`(field)/field/layout.tsx`) + org-scope `listInventoryItems` | Unauthenticated visitor reads all inventory incl. **costs** | S |
| SSRF guard + timeout on calendar-feed fetch (`calendar-sync/actions.ts`) | Operator can make cron fetch `169.254.169.254`/internal | S |
| Job-status-on-DB-down (`runner.ts`, `notification-delivery-job.ts`) | Runner reports green while broken; retries never fire | S |
| Feature-flag impersonation "View as customer" OFF | Banner says Org B but middleware never swaps org | S |
| Flip CI on: `typecheck && lint && build` required check + pre-commit | Build currently **ignores all TS + ESLint errors** → broken/finance code deploys | M |
| `mapPoolAll(4)` on `investor-portal` + `development-os` hub pages | 6 unbounded `Promise.all` vs `max:5` pool → saturation | S |

### 🟠 P0 · Make the stuck roles operable (functional)
| Item | Unblocks | Effort |
|---|---|---|
| Site Supervisor cabinet → enable request-material / log-crew / zones / photo / submit | site supervisor | M |
| Procurement Manager cabinet → wire "+ Purchase request" (auto-link supervisor req) | procurement | M |
| Concierge hub → unlock Templates / Memory / Review-handoffs | concierge | M |
| CFO/Accountant cabinet → fix dead `/finance/transactions` links + inline invoice approve | accountant | S–M |
| Kill mocks: `/communications`, `/operations/turnovers`, `/strategic`, `/cabinets/procurement-manager/pos`; promote real `/whatsapp` + Plans into nav | removes the founder anti-pattern | S–L |
| Ship `/buyer-portal/payments` + `/buyer-portal/documents` (routes don't exist) | every buyer + sales conversion | M |
| `/development-os/contracts/[id]` (milestone invoice / discount / sign) | sales manager | M |
| BOQ detail inline row edit/add/delete + status | estimator | M |
| `daily-digest` AI implemented for real (reference template) + inbound WhatsApp → concierge | founder's AI vision | M each |

### 🟡 P1 · Close the loops (this quarter)
- **Data integrity keystone:** add `organizationId` to `projects`+`villas`, backfill, filter ~20-30 query sites; pass org into `generateOwnerStatement` + denormalize onto finance lines; period-lock guard in expense/fee inserts. **(L)**
- **Procurement RFQ pipeline:** PR→RFQ→compare→award→PO + per-line receipt + 3-way invoice match. **(L)**
- **Sales collection:** finish reminder engine (due/overdue + WhatsApp branch), buyer installment editor, sales-cabinet payment dashboard. **(L)**
- **Investor compliance:** capital-call investor surface + funding, capital-account PDF (DPI/TVPI/MOIC), e-sign, `/investors/[code]/capital-account`. **(L)**
- **Finance writes (batchable M):** tax-reports regenerate/mark-filed, shared-cost rule engine, doc-extraction approve/reject, cashflow create/promote, revenue-stream log form, profitability recompute.
- **Marketing operability:** campaigns + content create/approve/publish; conversations reply composer. **(M)**
- **Booking/guest edits:** `updateBookingAction`, guest detail/edit/dedupe, feed-URL edit, channel detail. **(M)**
- **Testing:** behavioral tests for `statement-generator` + `dashboard-cabinet-queries` revenue aggregates; commit visual-regression baselines. **(L/M)**
- **Observability:** wire `logger.ts`→Sentry/Logtail, `/api/cron/health` 503 threshold, notification-failure alert, group-level `error.tsx` (only 1 exists across 832 routes). **(M)**
- **Schedule/site/field/utilities/platform-ops/integrations** write surfaces (see §C/§D tables). **(M each)**

### 🟢 P2 · Polish & deferred
Inline edits/quick-toggles, missing `[id]/edit` routes (actions exist, unrouted), stock quick-adjust, checklist template editor, pricing comp feed, concierge streaming, smart-lock integration, security event filters + unlock-account, `/platform/billing`+`/support`, i18n/timezone threading (~40 pages hardcode `en-GB`/UTC), a11y `<FormField>` wrapper, marketing SEO/JSON-LD, AI model RATES → DB table, legacy pricing `mode:number`→`bigint`.

---

## C. Strategic bets (define the ceiling)
1. **`organizationId` tenancy backbone + RLS behind app-filtering** — highest-ROI; closes the field leak, statement cross-tenant risk, and ~60 transitively-scoped tables.
2. **Real AI-assistant builder + training in-platform** — "add custom agent" UI + implement the 14 stubs (daily-digest first). The founder's explicit bar; competitors don't offer this self-serve.
3. **Conversational concierge on WhatsApp** (inbound webhook → AI → human handoff) → Akia/Duve/Enso parity on the channel guests actually use.
4. **Estimator/takeoff engine** — mount the orphaned `DrawingViewer`, build a rate library, wire `boq_actuals`/`variance_reviews` → PlanSwift/CostX category.
5. **Buyer money loop + real payment rails** — buyer-portal payments/docs + finished reminder engine + live Xendit/Stripe (retire `ManualStubProvider`).
6. **Investor transactional/compliance layer** — capital calls + capital-account PDF statements + e-sign + tax hub → Juniper-Square-grade.
7. **A real test pyramid + CI that enforces it; observability spine for 108 cron jobs.**
8. **Consolidate the dual pricing/override systems** (`ratePlanOverrides` vs `villaRateOverrides`) via a `villas.pricing_mode` flag + deprecation.

---

## D. Functional review (full)

<details><summary>Per-menu reality tables, the 5 end-to-end flows, and benchmark gaps (4 of 8) — verbatim</summary>

# Arconique Platform — Founder's Functional Review

**Date:** 2026-06-06 · **Author:** Principal Product Engineering · **Source:** verified functional-state audit (215 menu items + 9 surface/AI probes + 11-step guest lifecycle + 21-step money/sales/investor lifecycle + 4 best-in-class gap matrices)

---

## 1. Executive Verdict

**The honest number:** of the ~215 audited menu items, roughly **65% are REAL working tools**, **~22% are PARTIAL** (live reads, missing or unwired writes), and **~13% are MOCK / SHELL / MISSING** (hardcoded data, static layout, or a nav item pointing at a route that doesn't exist on disk). The platform is **far past "pretty shell" in the operational core** (guest stays, front office, operations/field, housekeeping, owner statements, investor capital backbone, procurement-in-Management-OS, site reports, safety, QA/QC) and **still a shell in three specific places that block real people from working today.**

**The three biggest themes:**

1. **Cabinets are dashboards, not workbenches.** The most damaging pattern is the role "cabinet" that shows beautiful live KPIs but disables every action button with "coming soon." The **Site Supervisor cabinet** (`/development-os/cabinets/site-supervisor`), **Procurement Manager cabinet** create-PR button, and **Concierge hub** (`/dashboard/concierge`) all do this. A supervisor can *see* yesterday's reports but cannot raise a material request, log crew count, or upload a photo from the cabinet; procurement can *see* open PRs but cannot *create* one. The real write surfaces sometimes exist elsewhere (`/development-os/site-reports/new` is fully REAL), but the cabinet — the thing the role opens first — is read-only. This is the exact founder anti-pattern ("WhatsApp messages 1820, no way to connect").

2. **AI is a framework, not yet a workforce.** The agent *infrastructure* is genuinely strong and best-in-class for an in-house build — `/platform/agents/[id]` has real CRUD, per-org subscriptions, knowledge-doc upload + chunking, run telemetry, and a test playground. But **14 of 35 named agents are stubs that return hardcoded/empty output before Claude is ever called** (concierge-agent, daily-digest, cashflow-forecaster, photo-organiser, turnover-allocator, tax-assistant, vendor-score-updater, etc.). All **6 of the founder's named assistants** are missing or stubbed: no supervisor-AI (no WhatsApp+vision), no working daily-digest, concierge routing always returns "issue", no real-estate-agent public chatbot, tax assistant has no transaction roll-up, no weekly materials/zone planner. The chassis is built; the engines aren't.

3. **The money loop has two broken bridges: buyer self-service and live payment rails.** `/buyer-portal/payments` and `/buyer-portal/documents` are **nav links pointing at folders that do not exist on disk** — a buyer literally cannot see their installment ladder or download a floorplan/PPKPR/IMB. And every payment provider (`features/payments/provider-selector.ts`) falls through to `ManualStubProvider`: Stripe is the only "live" one and Wise/PayPal/Xendit are DryRun stubs. Buyer payment reminders fire only 2 of 4 declared triggers and the WhatsApp channel logs `channel_not_yet_implemented`. The off-plan *backbone* (contracts, milestones, discount chain, waterfall, distributions) is excellent; the *collection* edge is not wired.

**The single most important shift:** **stop building new surfaces and turn the disabled buttons on.** The fastest path from "impressive demo" to "my team can run the company on it" is to (a) make the four blocking cabinets writable, (b) ship the two missing buyer-portal routes, and (c) give exactly **one** AI agent (daily-digest) a real implementation as the reference template for the other 13. Everything else is enhancement.

---

## 2. Per-Product Menu Reality Tables

State legend: **REAL** = live reads + working writes · **PARTIAL** = live read, writes missing/unwired · **MOCK** = hardcoded data · **SHELL** = static layout, no data · **MISSING** = nav item, no route on disk.

### 2.1 Development OS — Finance / CFO / Capital

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| CFO / Accountant Cabinet (`/cabinets/cfo-accountant`) | **PARTIAL** | ⚠️ partial | Disabled Tax-pack PDF + Journal-entry buttons; links to non-existent `/finance/transactions` snap-receipt/quick-entry | **P0** |
| Finance Hub (`/finance`) | REAL | ✅ | No quick-entry CTA from hub | P2 |
| Transactions ledger (`/finance/transactions`) | REAL | ✅ | No inline edit / reconcile toggle | P2 |
| Quick-entry spreadsheet (`/finance/transactions/quick-entry`) | REAL | ✅ | — | P0 |
| Invoices + detail/payment (`/finance/invoices`, `/[id]`) | REAL | ✅ | — | P0 |
| Tax types (`/finance/tax-types`) | REAL | ✅ | — | P0 |
| Tax reports (`/finance/tax-reports`) | **PARTIAL** | ❌ | Read-only; no regenerate, no "mark filed" | P1 |
| Shared costs (`/finance/shared-costs`) | **PARTIAL** | ❌ | `proposeSharedCostAllocation` exists but unwired; rule engine not built | P1 |
| Document extractions (`/finance/document-extractions`) | **PARTIAL** | ❌ | No approve/reject/edit row actions | P1 |
| Banking (`/banking`) | REAL | ✅ | — | P0 |
| Cashflow forecast (`/cashflow-forecast`) | **PARTIAL** | ❌ | No create/promote/regenerate button | P1 |
| Commitments + detail (`/commitments`, `/[id]`) | REAL | ✅ | — | P0 |
| Distributions + new + detail (`/distributions`, `/new`, `/[id]`) | REAL | ✅ | — | P0 |
| Unit profitability (`/profitability`) | **PARTIAL** | ❌ | `recomputeUnitAllocation` unwired | P2 |
| Revenue streams (`/revenue-streams`) | **PARTIAL** | ❌ | No "Log revenue" form (blocks distribution inputs) | P1 |
| Investors + detail + grant-access (`/investors`, `/[code]`, `/grant-access`) | REAL | ✅ | — | P0 |
| Investor capital account (`/investors/[code]/capital-account`) | **SHELL** | ❌ | Page implementation missing | P1 |
| Investor requests + detail (`/investor-requests`, `/[code]`) | REAL | ✅ | — | P0 |

### 2.2 Development OS — Procurement / Warehouse / QS / Site

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Vendors (`/vendors`) | REAL | ✅ | No bulk import; performance metrics manual | P1 |
| Materials / Purchase Orders (`/materials`) | REAL | ✅ | Delivery quick-entry page incomplete; no PO amendment; no invoice match | **P0** |
| Purchase Requests (`/procurement/purchase-requests`) | REAL | ✅ | No vendor-side RFQ portal; no auto-escalation | P1 |
| Quotation comparison (`/procurement/quotation-comparison`) | **PARTIAL** | ❌ | Read-only; no select/award button; no scoring | P1 |
| Procurement Manager cabinet (`/cabinets/procurement-manager`) | **PARTIAL** | ⚠️ | "+ Purchase request" button **disabled "coming soon"** — cannot create PRs | **P0** |
| **PO list (`/cabinets/procurement-manager/pos`)** | **MOCK** | ❌ | **100% hardcoded `MOCK_POS` array — delete it; real list is `/materials`** | P1 |
| Inventory items (`/inventory/items`) | REAL | ✅ | No bulk SKU import / category UI | P2 |
| Inventory movements (`/inventory/movements`) | REAL | ✅ | Quick-entry multi-line form incomplete; no barcode | P1 |
| Warehouse Manager cabinet (`/cabinets/warehouse-manager`) | REAL | ✅ | Stocktake + receiving routes unwired | P1 |
| **Site Supervisor cabinet (`/cabinets/site-supervisor`)** | **PARTIAL/SHELL** | ❌ | **Report submit, photo upload, material request, crew log all disabled "coming soon"** | **P0** |
| **Finance: Transactions (linked from CFO cabinet)** | **MISSING** | ❌ | **CFO cabinet CTAs "Snap receipt/Quick entry" point at non-existent routes** | **P0** |
| QS / Cost Analyst cabinet (`/cabinets/qs`) | **PARTIAL** | ⚠️ | Variance approval buttons disabled; Export XLSX disabled; role (reader vs signer) ambiguous | P1 |
| BOQ list + detail + quick-entry + import (`/boq`, `/[code]`, `/quick-entry`, `/[code]/import`) | REAL | ✅ (detail: ⚠️) | **BOQ detail has no inline row edit/add/delete or status buttons — estimator must use API** | **P0** (detail) |
| BOQ → Generate RFQ (action) | REAL | ✅ | One PR per item; text-prompt date | P1 |
| Specifications / Method statements / Drawings libraries | **PARTIAL** | ✅ (ref) | No "Link to BOQ" actions; display-only lists | P2 |
| Procurement Analyst / QS Cost Analyst AI agents | **PARTIAL** | ❌ | Not invokable from workflow pages; config locked to `/platform` | P1–P2 |

### 2.3 Development OS — Schedule / Site / Sales / Marketing / Strategic

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Site reports list + new + detail (`/site-reports`, `/new`, `/[id]`) | REAL | ✅ | — (full crew/zone/blocker capture) | P0 |
| Schedule hub (`/schedule`) | REAL | ✅ | No in-page create task | P2 |
| Schedule · Calendars (`/schedule/calendars`) | **PARTIAL** | ❌ | Detail/edit incomplete | P1 |
| Schedule · Resources (`/schedule/resources`) | **PARTIAL** | ❌ | Resource CRUD stub; no crew roster/attendance | P1 |
| Productivity (`/productivity`) | **PARTIAL** | ❌ | `recordProductivityLog` has no UI form — log page is static text | P1 |
| Safety list + new (`/safety`, `/new`) | REAL | ✅ | — | P0 |
| QA/QC list + new + inspect (`/qa-qc`, `/new`, `/[code]/inspect`) | REAL | ✅ | — | P0 |
| Sales pipeline (`/sales`) + Lead detail (`/sales/[id]`) | REAL | ✅ | No installment view; no auto-reminders; Documents tab "coming soon" | P1 |
| Reservations (`/reservations`) | REAL | ✅ | Extend/mark-paid/convert not surfaced as row actions | P1 |
| **Contracts (`/contracts`)** | **PARTIAL** | ❌ | **No contract detail page `[id]`; discount/invoice/sign flows unreachable** | **P0** |
| **Invoices (sales) (`/invoices`)** | **PARTIAL** | ❌ | No detail/PDF/send/mark-paid; no manual create | P1 |
| Discounts (`/discounts`) | REAL | ✅ | Propose/apply modal not wired into contract UI | P1 |
| Marketing dashboard / lead-sources | REAL | ✅ | — | P2 |
| **Campaigns (`/marketing/campaigns`)** | **PARTIAL/SHELL** | ❌ | **No create/edit/status/cost forms — `createCampaign` unreachable** | **P0** |
| **Content pipeline (`/marketing/content`)** | **PARTIAL/SHELL** | ❌ | **No create/approve/publish forms; kanban read-only** | **P0** |
| Sales conversations (`/marketing/conversations`) | **PARTIAL** | ❌ | No reply composer; no consent toggle; AI result not shown | P1 |
| Manager performance (`/marketing/manager-performance`) | **PARTIAL** | ❌ | Cron-computed, no dispute UI | P2 |
| **Communications (`/communications`)** | **MOCK** | ❌ | **All metrics hardcoded JS strings; templates hardcoded; disabled buttons — the founder anti-pattern** | **P0** |
| **WhatsApp (`/whatsapp`)** | **PARTIAL** | ❌ | Real data but hidden from nav; no send UI, no template mgmt, no inbound routing | **P0** |
| Channels OTA (`/channels`) | REAL | ✅ | Hidden from nav; misplaced persona (should be Management OS) | P2 |
| Marketing staff cabinet + Marketing Assistant agent | REAL | ✅ | Inline accept/reject of AI drafts | P1–P2 |
| **Strategic (`/strategic`)** | **MOCK** | ❌ | **Hardcoded UNITS; Export/Scenario disabled; no live projections** | **P0** |
| Visual reports (`/reports`) | **PARTIAL** | ❌ | S-curve hardcoded; no PDF export; per-project route missing | P1 |
| Risk radar (`/risk-radar`) | REAL | ✅ | Detail page has no acknowledge/resolve buttons | P1 |
| Project cycle intelligence (`/project-cycle`) | **PARTIAL** | ❌ | No accept/reject; no payroll/capacity forms | P1 |
| Projects list + detail (`/projects`) | REAL | ✅ | Verify all 5 detail tabs save | P0 |
| Assets (`/assets`) | **PARTIAL** | ❌ | List read-only; no `AssetModalForm` (asset-type form exists) | P1 |
| PM / Sales-Manager / Marketing-staff cabinets | REAL | ✅ | Quick-create + drill-down shortcuts | P0–P2 |

### 2.4 Management OS — Portfolio / Bookings / Guest / Owner-Stays / Front Office / Operations / Inventory / Finance / Revenue / Security

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Projects / Villas / Owners / Ownership-shares (`/dashboard/projects`,`/villas`,`/owners`,`/shares`) | REAL | ✅ | Owner detail tabs are stubs | P0 |
| Bookings list + new + detail (`/bookings`, `/new`, `/[id]`) | REAL | ✅ | Filters display-only; bulk = alerts; **no `updateBookingAction`** | P1 |
| Booking edit (`/bookings/[id]/edit`) | **PARTIAL** | ❌ | No server action to commit edits — cannot change dates post-create | P1 |
| Calendar / Sync / Rate plans (`/bookings/calendar`,`/sync`,`/rates`) | REAL | ✅ | Minor (legend, dynamic-pricing link) | P0 |
| Channels (`/channels`) | REAL | ✅ | No channel detail page | P1 |
| **Guests (`/dashboard/guests`)** | **PARTIAL** | ❌ | Read-only table; no `[id]`/edit route; no dedupe | P1 |
| Calendar feed detail + sync (`/integrations/calendar-feeds/[id]`) | REAL | ✅ | No feed-URL edit; conflict-resolution UI unclear | P1 |
| Guest stays · overview/tokens (`/guest-stays`, `/tokens`) | REAL | ✅ | — | P2 |
| Villa guides (+ sections/wifi) (`/villa-guides/*`) | REAL | ✅ | — | P2 |
| Guest services (+ catalog/orders) (`/guest-services/*`) | REAL | ✅ | — | P2 |
| **Concierge hub (`/dashboard/concierge`)** | **PARTIAL** | ❌ | **Templates, Memory editor, Review-handoffs all disabled; no in-cabinet AI config** | **P0** |
| Security events/verifications/overview (`/guest-stays/security/*`) | REAL | ✅ | — | P2 |
| Owner stays: overview/requests/detail/policies/equiv-groups/finance-bridge | REAL | ✅ | Minor (new-request CTA, batch approve, finance-link detail) | P0–P1 |
| Front office: today/arrivals/watch/departures/in-house (`/front-office/*`) | REAL | ✅ | Day-report stub; VIP-prep deferred | P0–P1 |
| Availability / Readiness / Arrival-readiness / Requests (`/availability`,`/readiness`,`/front-office/readiness`,`/requests`) | REAL | ✅ | — | P0 |
| Operations command center (`/operations`) | REAL | ✅ | Copilot empty-state; "Brief team" disabled | P1 |
| Operations tasks + detail + housekeeping + maintenance(+detail) (`/operations/*`) | REAL | ✅ | — | P0 |
| Operations preventive (`/operations/preventive`) | REAL | ✅ | Verify daily cron mints due tasks | P1 |
| Operations service-requests + detail | REAL | ✅ | — | P0 |
| **Operations · Turnovers (`/operations/turnovers`)** | **MOCK** | ❌ | **9 hardcoded turnovers (Wayan/Made/Putu); no DB reads, no drag-drop, no allocator agent** | **P0** |
| Operations checklists (`/operations/checklists`) | **PARTIAL** | ✅ | Read-only template library; no +New template form | P2 |
| Operations damage reports | REAL | ✅ | — | P0 |
| Field PWA today + task detail (`/field`, `/field/tasks/[id]`) | REAL | ✅ | Voice notes "coming soon"; offline sync roadmap | P0 |
| Inventory: stock command / items / locations / categories / suppliers / movements / counts | REAL | ✅ | Several `[id]/edit` routes missing (actions exist, not routed); no auto-PR from low stock | P0–P1 |
| Stock levels (`/inventory/stock`) | **PARTIAL** | ❌ | Reference-only; no quick-adjust | P1 |
| Procurement requests / orders / hub (`/dashboard/procurement/*`) | REAL | ✅ | No RFQ stage; no 3-way invoice match; no approval thresholds | P0 |
| Maintenance intelligence: hub/templates/risks/windows/plan-detail | REAL | ✅ | **Plans list not in nav** | P1 |
| Utilities: hub/accounts/account-detail/readings | REAL | ✅ | — | P0 |
| **Utilities · Payments (`/utilities/payments`)** | **MISSING** | ❌ | **Route does not exist; reminders stranded on per-account pages** | P1 |
| Finance hub / statements / disputes / transparency / material-usage | REAL | ✅ | Manual email send; no bulk generate; payout rails not live | P0–P1 |
| **Payments (`/dashboard/payments`)** | **PARTIAL** | ❌ | **Read-only; no mark-paid/refund; Wise/PayPal = DryRun stubs** | **P0** |
| Payments webhooks / providers / providers-new | **PARTIAL** | ⚠️ | No retry/edit/health; add-only | P1–P2 |
| Owner intelligence (`/owner-intelligence`) | REAL | ✅ | Revenue surface hardcoded; no auto snapshots | P1 |
| Dynamic pricing (`/pricing`) | REAL | ✅ | **Channel push stubbed (no real Airbnb/Booking API)**; no comp feed | **P0** |
| Direct bookings / Guest journey / Service fulfilment | REAL | ✅ | Manual conversion; no SLA/vendor router; reminders manual | P1 |
| Security / Auth / Jobs / Health / Notifications / Audit / Cameras / MFA | REAL (mostly) | ✅ | Filters/pagination; auth & cameras minor | P0–P1 |
| Security / Events + Login-attempts | **PARTIAL** | ⚠️/❌ | No filters; **no unlock-account form** | P1–P2 |
| Settings: main / account-security / users / team / notification-prefs / AI-agents | REAL | ✅ | Bulk import; recovery-code regen | P0–P1 |
| **Settings / Integrations (`/settings/integrations`)** | **PARTIAL** | ❌ | **Detail pages not built; no test-connection — founder's bar: integrations must be REAL** | **P0** |
| **Settings / Security (`/settings/security`)** | **SHELL** | ❌ | No mutations; scope unclear — remove or build | P2 |

### 2.5 Owner & Investor Portals

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Owner overview (`/owner`) | REAL | ✅ | — | P0 |
| Owner villas / calendar / documents (`/owner/villas`,`/calendar`,`/documents`) | **PARTIAL** | ✅ (read) | Read-only; no owner writes (cancel/dispute/upload) | P0 |
| Owner statements + detail (`/owner/statements`,`/[id]`) | REAL | ✅ | — (dispute + acknowledge live) | P0 |
| Owner inbox (`/owner/inbox`) | REAL | ✅ | — | P0 |
| Owner settings (`/owner/preferences`) | REAL | ✅ | 2FA/payout/profile-edit deferred | P1 |
| Owner request-stay + view (`/owner/stays/new`,`/[id]`) | REAL | ✅ | Not featured in main nav | P0 |
| Investor overview + dashboard (`/investor-portal`,`/dashboard`) | REAL | ✅ | AI assistant "coming soon" | P0–P1 |
| Investor capital / distributions / NAV / construction | **PARTIAL** | ✅ (read) | Read-only; no capital-account statement/PDF, no DPI/TVPI | P0–P2 |
| Investor profile / requests / wallet withdraw / wallet reinvest | REAL | ✅ | — | P0 |

### 2.6 Buyer Portal

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Buyer dashboard / my-villas / progress-reports | **PARTIAL** | ✅ (read) | Live reads, no writes | P1 |
| **Buyer Payments (`/buyer-portal/payments`)** | **MISSING** | ❌ | **No route folder on disk — buyer cannot see installments or pay** | **P0** |
| **Buyer Documents (`/buyer-portal/documents`)** | **MISSING** | ❌ | **No route folder — cannot download floorplans/PPKPR/IMB/receipts** | **P0** |

### 2.7 Guest Stay Journey (`/stay/[token]`)

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Hub / verify / check-in / wifi / guide / house-rules / neighborhood / emergency | REAL | ✅ | Smart-lock = stub; ID upload no OCR/e-sign | P0 |
| Concierge AI (`/concierge`) | REAL | ✅ | Web-portal only; routing agent is stub; no streaming | P0 |
| Services & extras + requests + request-detail + offline | REAL | ✅ | No guest-facing payment capture on upsells | P0 |

### 2.8 Platform / AI-Admin OS

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Landing (`/platform`) | **SHELL** | ❌ | Hardcoded `PLANNED_PAGES`; 2 cards link to missing routes | P2 |
| Agents list / new / detail (config·subs·knowledge·test) | REAL | ✅ | Knowledge async no auto-retry | P0–P1 |
| Agents detail (runs tab) | **PARTIAL** | ✅ | Observability-only (fine) | P1 |
| Organizations list (`/platform/organizations`) | **PARTIAL** | ✅ | Read-only discovery | P1 |
| **Org detail (`/platform/[orgCode]`)** | **PARTIAL** | ❌ | **All action buttons disabled — cannot extend trial/comp/cancel/impersonate** | P1 |
| Revenue / Usage / Audit | **PARTIAL** | ✅ | Read-only; per-org metrics deferred | P1–P2 |
| **Support (`/platform/support`)** | **MISSING** | ❌ | Route does not exist | P1 |
| **Billing (`/platform/billing`)** | **MISSING** | ❌ | Route does not exist; Stripe Connect not wired | P2 |

### 2.9 Field PWA & Vendor Portal

| Menu item | State | Works for role? | Top gap | Priority |
|---|---|---|---|---|
| Field Today (`/field`) | REAL | ✅ | Quick actions hardcoded to `/field/tasks/demo` | P1 |
| Field inventory (`/field/inventory`) | **PARTIAL** | ❌ | Item nav bounces to `/dashboard`; no field item detail / usage log | P1 |
| Field task detail (`/field/tasks/[id]`) | REAL | ✅ | inventory.write role check; damage-report link bounces out; no time-clock | P0 |
| **Field demo task (`/field/tasks/demo`)** | **MOCK** | (demo) | Hardcoded; exposed as "Demo" link in production nav | P2 |
| Vendor portal (`/vendor/service/[token]` + invoice) | REAL | ✅ | No completion photo upload; no payment claim | P2 |

---

## 3. The Five End-to-End Flows

### 3.1 Guest journey (booking import → check-in → concierge → service → revenue → owner statement → owner-stay)
**Verdict: works end-to-end, but with manual seams.**
- ✅ **Works:** booking import/sync, token issuance, ID/check-in form + verification gate, Wi-Fi reveal, AI concierge chat + human handoff, service ordering with margin capture, revenue bridge to `revenue_lines` (idempotent), housekeeping/maintenance task execution via PWA, owner statement generation + owner view + dispute, owner-stay request → policy review → approve.
- ⚠️ **Broken/manual:** welcome message is **copy-paste by operator** (no auto SMS/WhatsApp send — founder anti-pattern); door code is a **hardcoded smart-lock stub**; service-request → operations task is **manual, not auto-created**; **vendor/internal cost is manual entry** (margin = guest_price − typed cost); payment-method/payout not surfaced in owner view.
- ❌ **Missing:** guest-facing payment capture on upsells; post-stay folio/receipt; passport OCR/e-sign; auto token issuance on import.
- **Next builds:** (1) auto-send token URL on issuance via existing Twilio/Resend providers; (2) auto-create operation task from confirmed service request; (3) Stripe/Xendit pay-step on `guest-services` order (margin already computed server-side); (4) integrate one real smart-lock provider.

### 3.2 Dev procurement → payment (supervisor request → PR → RFQ → PO → receipt → invoice → ledger)
**Verdict: BROKEN at the front of the chain (Dev OS).** (Note: the *Management OS* procurement chain is fully REAL — the break is specifically in Development OS cabinets.)
- ✅ **Works:** PO create + track (`/development-os/materials`), transaction recording (`/finance/transactions`), P&L by project, cashflow forecast (cron-generated), distributions declare/execute.
- ⚠️ **Broken:** Site Supervisor cabinet **cannot raise a material request** (button disabled); Procurement cabinet **cannot create a PR** (button disabled "coming soon"); PO list at `/cabinets/procurement-manager/pos` is **100% mock**; CFO cabinet has **no inline invoice approval** and links to non-existent snap-receipt routes.
- ❌ **Missing:** entire RFQ/vendor-quote/AI-scoring pipeline ("quotation flow coming soon"); per-line warehouse receipt + 3-way invoice match.
- **Next builds:** (1) wire `createPurchaseRequest` to a button in *both* supervisor and procurement cabinets, auto-linking supervisor request → PR; (2) delete mock `/cabinets/procurement-manager/pos`, point nav at `/materials`; (3) build PR-detail → RFQ → compare → award → PO; (4) build per-line delivery receipt with invoice reconciliation.

### 3.3 Sales → installments → investor cashflow
**Verdict: strong backbone, broken collection edge.**
- ✅ **Works:** lead pipeline, deposit-locked reservations, contract groups with progress-triggered milestones, discount approval chain, late-fee rules, distribution waterfall (preview/declare/execute), per-commitment IRR, investor wallet withdraw/reinvest, investor-request HITL inbox.
- ⚠️ **Broken/partial:** **no contract detail page** (`/contracts/[id]`) so milestone-invoice/discount/sign actions are unreachable; sales invoices have no detail/PDF/send; reminder cron fires only 2 of 4 triggers and **WhatsApp branch logs "not implemented"**; no buyer-payment status visible in sales cabinet.
- ❌ **Missing:** buyer installment-plan editor in Dev OS UI (`land_payment_installments` table exists, no UI); **buyer-portal Payments + Documents routes**; capital-call *creation* in Dev OS + auto-trigger from cashflow gaps.
- **Next builds:** (1) ship `/buyer-portal/payments` + `/documents`; (2) finish reminder engine (wire `milestone_invoice_due` + `milestone_overdue`, implement WhatsApp); (3) build `/development-os/contracts/[id]` with milestone-invoice issuance; (4) surface admin capital-call creation + cashflow-gap auto-trigger.

### 3.4 AI assistant — add + train + run
**Verdict: chassis REAL, engines mostly STUB.**
- ✅ **Works:** agent CRUD, per-org subscription gating, knowledge-doc upload + chunking + RAG storage, run telemetry, in-platform test chat (`/platform/agents/[id]`). 9 Dev-OS agents shipped as configurable.
- ⚠️ **Broken:** **14 of 35 agents return hardcoded/empty output before Claude is called** (concierge-agent always "issue", daily-digest no logic, cashflow-forecaster, photo-organiser, turnover-allocator, tax-assistant, vendor-score-updater, etc.); test chat tests canonical prompt only; agents not invokable from their workflow pages (e.g., no "Ask AI" on quotation-comparison).
- ❌ **Missing:** **all 6 founder-named assistants** (supervisor-AI w/ WhatsApp+vision, working daily-digest, autonomous concierge routing, real-estate-agent public chatbot, Indonesia tax roll-up, weekly materials/zone planner); "add custom agent" UI (new agents need SQL + code commit); agent scheduler UI.
- **Next builds:** (1) implement **daily-digest as the reference real agent** (arrivals+departures+tickets+exceptions → brief), then template the other 13; (2) wire concierge-agent to a real intent classifier; (3) build the inbound-WhatsApp → guest-concierge pipeline; (4) "add custom agent" form + migration.

### 3.5 Channel / WhatsApp / payment integrations
**Verdict: notifications & calendar-sync REAL; channel-push & payments STUBBED.**
- ✅ **Works:** calendar sync (iCal pull from Airbnb/Booking, conflict detection in DB), notifications (Resend email + Twilio SMS/WhatsApp + in-app, dry-run by default — flip env to go live).
- ⚠️ **Broken:** dynamic-pricing **channel push is stubbed** (records events, doesn't push rates to Airbnb/Booking/Expedia); calendar conflict-resolution UI not exposed.
- ❌ **Missing/stubbed:** payment providers all fall through to `ManualStubProvider` (only Stripe live; Wise/PayPal/Xendit = DryRun); WhatsApp inbound webhook exists but **not wired to the guest concierge or to template/send/routing UI**; `/communications` is a hardcoded mock.
- **Next builds:** (1) implement Xendit (Indonesia) + Stripe real provider classes; (2) build a channel-manager client to push rates/availability; (3) wire inbound WhatsApp webhook → guest concierge (sender phone → active stay token) with the existing safety + handoff path; (4) replace `/communications` mock with the real `/whatsapp` surface in nav.

---

## 4. Best-in-Class Gap Summary

### Guest experience & concierge AI — match **Duve, Enso Connect, Akia, Hostfully**
*Position:* genuinely strong back-end (real grounded concierge, safety/redaction, AI→human handoff, journey engine, OTP verify, priced upsells with margin). We trail on conversational + revenue surfaces.
- **Conversational concierge over WhatsApp/SMS** (P0) — wire the existing inbound webhook into the concierge pipeline; outbound Twilio/Meta already exists. *Single highest-leverage move; matches founder's "AI reads chat and replies" vision.*
- **Guest-facing payment capture on upsells** (P0) — add Stripe/PSP checkout to the service-order flow (pricing already server-side).
- **Trainable free-form concierge knowledge base** (P0) — reuse the `/platform/agents/[id]` doc-upload pattern for the guest concierge.

### Construction estimating / QS / takeoff — match **PlanSwift, CostX, Bluebeam Revu, Buildertrend**
*Position:* solid structured BOQ ledger + real BOQ→RFQ bridge; but takeoff is absent and a capable `DrawingViewer` component is built yet mounted nowhere.
- **On-screen takeoff feeding BOQ quantities** (P0) — mount the orphaned `src/components/ui/primitives/drawing-viewer.tsx`, persist strokes, push measured qty → `boq_items`. *80% built already.*
- **Cost/rate library & composite assemblies** (P0) — `boq_items` already has waste/logistics/labor factors + `inventoryItemId` FK; add an org-scoped rate library so estimators stop hand-typing unit rates.
- **BOQ actuals-vs-planned variance + QS sign-off** (P0) — tables (`boq_actuals`, `variance_reviews`) and `computeVariance()` exist but nothing reads/writes them; wire PO receipts → actuals → variance queue.

### Real-estate developer sales CRM — match **Salesforce, HubSpot, off-plan CRMs (PropSpace/Agora-style)**
*Position:* excellent off-plan transaction backbone (reservations, milestones, discount chain, reminder engine, AI assistant); trail on demand capture + buyer self-service.
- **Buyer self-service installment portal** (P0) — build `/buyer-portal/payments` + `/documents` (data already modeled in `sales.ts`) + Xendit/Stripe checkout.
- **Automated multi-channel payment reminders, WhatsApp-first** (P0) — finish `notification-dispatch-job.ts` (wire due/overdue triggers, implement WhatsApp branch).
- **Web-to-lead capture + omnichannel reply inbox** (P1) — public lead form → pipeline; upgrade `/marketing/conversations` to two-way.

### Investor / LP portal — match **Juniper Square, Carta, AppFolio IM, Agora**
*Position:* unusually strong capital backbone (waterfall, IRR, wallet, NAV, multi-currency, live construction transparency); but explicitly read-only — not yet transactional/compliance-grade.
- **Investor-facing capital calls with in-portal funding** (P0) — `capital_calls` + allocations schema already exists (admin-only); surface to LP with confirm/upload-wire + reminders. *Data model already there.*
- **Branded capital-account statement w/ DPI/TVPI/MOIC + PDF** (P0) — copy the owner-statement PDF infra (`/owner/statements/[id]/pdf`); add the 3 standard multiples.
- **E-signature + tax-document (K-1 equiv.) delivery** (P0/P1) — reuse buyer signature primitives for commitment docs; add a tax-doc hub.

---

## 5. Prioritized Build Roadmap

Ranked by **"can a real person do their job today?"** — P0 items each unblock a named role currently stuck.

### P0 — Make core roles operable (mock/shell → real)

**Theme A — Turn the four blocking cabinets writable**
- **Site Supervisor cabinet** — enable "Request material" (→ `createPurchaseRequest`), "Log crew count", "Update active zones", "Photo upload", "Submit for sign-off"; or route buttons to the already-REAL `/site-reports/new`. **(M)** *Unblocks: site supervisor.*
- **Procurement Manager cabinet** — wire the disabled "+ Purchase request" button to a real create form auto-linked to supervisor requests. **(M)** *Unblocks: procurement.*
- **Concierge hub** — unlock Templates, Memory editor, Review-handoffs. **(M)** *Unblocks: concierge.*
- **CFO/Accountant cabinet** — fix the dead `/finance/transactions` snap-receipt/quick-entry links; add inline invoice approve + journal-entry button. **(S–M)** *Unblocks: accountant.*

**Theme B — Kill the mocks that masquerade as features**
- **`/operations/turnovers`** — replace `MOCK_TURNOVERS` with live housekeeping-task reads + drag-drop to `assignOperationTaskAction`. **(M)** *Unblocks: housekeeping manager.*
- **`/development-os/strategic`** — wire to real project-cycle/budget/variance data; remove disabled Export/Scenario or implement. **(L)** *Unblocks: CFO/strategic director.*
- **`/communications`** — delete the hardcoded mock; promote real `/whatsapp` into nav. **(S)**
- **Delete `/cabinets/procurement-manager/pos`** (mock); point nav at `/materials`. **(S)**

**Theme C — Ship the missing money routes**
- **`/buyer-portal/payments` + `/buyer-portal/documents`** — installment ladder + pay button + doc vault. **(M)** *Unblocks: every buyer + sales conversion.*
- **`/development-os/contracts/[id]`** — milestone timeline + issue-invoice + discount + signature matrix. **(M)** *Unblocks: sales manager.*
- **`/dashboard/payments` mutations** — mark-paid/refund + real Xendit/Stripe provider classes (retire `ManualStubProvider` for primary flows). **(L)** *Unblocks: payments operator.*

**Theme D — One real AI agent + the conversational concierge**
- **Implement `daily-digest` for real** as the reference template; **wire inbound WhatsApp → guest concierge**. **(M each)** *Unblocks: founder's AI vision + matches Akia/Duve.*

**Theme E — BOQ detail editing**
- **BOQ detail inline row edit/add/delete + status transitions** — estimator currently must use the API. **(M)** *Unblocks: estimator.*

### P1 — Close the loops

- **Theme: Procurement RFQ pipeline** — PR→RFQ→compare→award→PO + per-line warehouse receipt + 3-way invoice match. **(L)**
- **Theme: Sales collection** — finish reminder engine (due/overdue triggers + WhatsApp), buyer installment-plan editor, sales-cabinet buyer-payment dashboard. **(L)**
- **Theme: Investor compliance** — capital-call investor surface + funding, capital-account PDF statement w/ DPI/TVPI/MOIC, e-sign, tax-doc hub, `/investors/[code]/capital-account` page. **(L)**
- **Theme: Finance write surfaces** — tax-reports regenerate/mark-filed, shared-costs allocation rule engine, document-extraction approve/reject, cashflow-forecast create/promote, revenue-stream "Log revenue" form, unit-profitability recompute. **(M, batchable)**
- **Theme: Marketing operability** — campaigns + content create/approve/publish forms; conversations reply composer + consent toggle. **(M)**
- **Theme: Booking & guest edits** — `updateBookingAction`, guest detail/edit/dedupe, calendar feed-URL edit, channel detail page. **(M)**
- **Theme: QS takeoff** — mount `DrawingViewer`, persist strokes, push qty → BOQ; rate/price library; wire `boq_actuals`/`variance_reviews`. **(L)** *(strategic — see §6)*
- **Theme: Schedule/site** — resource/calendar CRUD, productivity log form, risk-radar detail actions, project-cycle accept/reject + forms, assets `AssetModalForm`. **(M)**
- **Theme: Field PWA** — real quick-action routes, `/field/inventory/[id]` with usage form, time-clock, keep damage-report in-PWA. **(M)**
- **Theme: Utilities & maintenance** — `/utilities/payments` page; add Plans to nav. **(S)**
- **Theme: Platform ops** — wire `/platform/[orgCode]` action buttons (extend trial/comp/cancel/impersonate); build `/platform/support`. **(M)**
- **Theme: Settings/Integrations** — build detail pages + test-connection for Stripe/Resend/Twilio. **(M)**

### P2 — Polish & deferred

- Inline edits/quick-toggles on transactions, stock quick-adjust, inventory `[id]/edit` routes, checklist template editor, dynamic-pricing comp feed + A/B, concierge streaming UX, smart-lock integration, channels move to Management OS, security event/login-attempt filters + unlock-account, `/platform/billing`, demo-task gating, audit pagination, bulk imports across modules. **(S each)**

---

## 6. Quick Wins vs Strategic Bets

### Quick wins (days, high "now-usable" payoff)
1. **Enable the disabled cabinet buttons** (supervisor, procurement, concierge, CFO) — mostly wiring to actions that already exist. Single biggest perception-of-completeness jump.
2. **Delete the three mocks** (`/communications`, `/cabinets/procurement-manager/pos`, demote `/field/tasks/demo`) and promote real `/whatsapp` + Plans into nav. Removes the founder anti-pattern in one sweep.
3. **`updateBookingAction`** + missing inventory/supplier/location `[id]/edit` routes — actions exist, just unrouted.
4. **`/utilities/payments` page** — straightforward list + `markUtilityPaymentPaidAction`.
5. **Auto-send guest welcome message** on token issuance via the existing Resend/Twilio providers (flip dry-run env). Kills the copy-paste anti-pattern.
6. **Multilingual + language-mirroring** in the concierge prompt — trivial, high perceived value.

### Strategic bets (weeks, define the product's ceiling)
1. **Real AI-assistant builder + training in-platform** — "add custom agent" UI + implement the 14 stubs (start with daily-digest as reference). This is the founder's explicit bar and the thing competitors don't have as a self-serve in-platform capability.
2. **Conversational concierge on WhatsApp** (inbound webhook → AI → human handoff) — the single move that brings us to Akia/Duve/Enso parity on the channel guests actually use.
3. **Estimator/takeoff engine** — mount `DrawingViewer`, build the rate library, wire actuals→variance. Converts a BOQ ledger into a real QS product (PlanSwift/CostX category).
4. **Buyer money loop** — buyer-portal payments/documents + finished reminder engine + live Xendit/Stripe. Turns the off-plan backbone into a CRM that actually collects.
5. **Investor transactional/compliance layer** — capital calls + capital-account PDF statements (DPI/TVPI/MOIC) + e-sign + tax hub. Moves the LP portal from "reporting" to Juniper-Square-grade.
6. **Channel manager + real payment rails** — rate/availability push to OTAs and real PSP integrations; the foundation for revenue capture at multi-tenant scale.

**Bottom line for the founder:** the platform is *already* a working tool for guests, front office, housekeeping/maintenance, owners, investors (read), vendors, and Management-OS procurement. It is *not yet* a working tool for the **site supervisor, procurement manager, estimator, concierge-as-AI-operator, and the buyer** — and the **6 named AI assistants don't exist yet.** Fix the disabled cabinets, ship the buyer routes, and make one AI agent real, and you cross the line from "impressive demo" to "my team runs the company on it."

</details>

---

## E. Technical review (full)

<details><summary>Security / data-integrity / perf / testing / observability — verbatim</summary>

# Platform Audit — Executive Improvement Roadmap

## 1. Executive summary

The platform is **architecturally mature but operationally under-instrumented**, with one foundational tenancy flaw that gates everything else. Across ~832 routes, the dominant pattern is sound: live-wired cabinets, layered auth, AES-256-GCM secret handling, idempotent migrations, and a well-designed AI safety/quota layer. However, three themes recur in the confirmed-serious findings: **(1) multi-tenant isolation has a root hole** — `projects`/`villas` carry no `organizationId`, so ~60% of the schema is only transitively scoped and one misscoped query (export, admin search, statement gen) can leak cross-tenant financial data; **(2) observability is effectively zero** — 108 cron jobs and all financial engines run with no external alerting, sparse error boundaries (1 across 832 routes), and at least one job that reports `success` while the DB is down; **(3) the financial engines that move millions have no behavioral test net** and ship through a build that ignores both TypeScript and ESLint. Several "high" items are genuinely cheap (field-PWA auth gate, SSRF guard, job-status-on-DB-down) and should be done this week. The single largest investment is closing the `organizationId` tenancy gap, which also unblocks the statement-generator and field-inventory isolation fixes.

## 2. What's strong (don't break this)

- **Live data wiring + graceful degradation in Management OS** — all 42 cabinets query real DB with `.catch()`/`safeList()`/`safeQuery` fallbacks and `mapPoolAll(4)` bounded concurrency against the `max:5` pool. This is the quality bar; replicate it, don't regress it.
- **Layered auth & RBAC** — canonical `user_roles` super-admin gate (cabinet roles cannot escalate), `enforceProductAccess` at dashboard/dev-os layout boundaries, 252+ server actions calling `requirePermission()`, unified `buildV1Route` (org-scoped key + 3-tier DB-backed rate limit), and `verifyCronAuth` across 105/108 cron routes.
- **Secret & money handling** — AES-256-GCM (WiFi, per-org AI keys, stay tokens), Vault references never exposed client-side, `bigint` MINOR units everywhere in `finance.ts`, and sha256 hash-based statement idempotency preventing double-generation.
- **Guest/concierge security** — defense-in-depth pure-function guards (`detectDisallowedIntent`, `redactSensitiveText`, `assertNoSecretLeak`), token isolation via innerJoin validation, multi-layer persistent rate limits. No LLM-only reliance.
- **AI cost/quota discipline** — hard daily/monthly caps at `aiExecute()` entry, tier-aware routing validated before provider resolution, accurate 13-model cost table, atomic usage upsert.
- **Owner/investor/buyer portal isolation** — owner statements protected by RLS + app-level `ownerId` check + `ownerVisible` flag; investor queries universally scoped by `investorId`; impersonation requires re-validated super_admin, HttpOnly cookies, and blocks writes.

## 3. Top risks (ranked)

Deduped across overlapping area reports (field-auth, statement-gen org-scope, build gates, and source-scan tests each appeared 2x).

| # | Problem (one line) | Impact | Fix | Effort |
|---|---|---|---|---|
| 1 | **No `organizationId` on `projects`/`villas`** (`schema/projects.ts`; `listProjects()` services.ts:35 unfiltered) | Root tenancy hole — cascades to ~60 tables (bookings, finance, pricing, inventory, stays). One misscoped export/admin-search/report leaks cross-tenant financial + guest data | Add denormalized `organizationId` + FK + index to both tables; backfill; filter all project/villa queries | **L** |
| 2 | **Field PWA has zero auth gate** (`(field)/field/layout.tsx`); `listInventoryItems()` self-scopes to nothing | Unauthenticated visitor hits `/field/inventory` → all active inventory (SKUs, qty, costs) returned unfiltered (RLS can't help — direct Postgres conn = `auth.uid()` NULL) | Add `getCurrentUserContext()`/`enforceProductAccess` gate in field layout; verify `listInventoryItems` scopes by org | **S** |
| 3 | **Calendar-feed fetch has no SSRF guard or timeout** (`calendar-sync/actions.ts` ~L222) | Operator with `integrations.write` adds feed → cron fetches `169.254.169.254` (cloud metadata), `127.0.0.1:5432`, internal services; probes topology / exfiltrates creds; can hang cron | Reject loopback/private CIDRs + AbortController timeout (30s) + optional provider allowlist | **S** |
| 4 | **Job runner returns `success` when DB is down** (`notification-delivery-job.ts` L20-25; `runner.ts` L48-57) | DB failover → job emits `{status:'success'}`, operators see green, notification retries silently never scheduled | In `finishJobRun()`/per-job: if `getDb()` null, return `status:'failed', error:'database_unavailable'` (calendar-sync already does this correctly) | **S** |
| 5 | **Zero external monitoring/alerting for 108 cron jobs**; API/cron/webhook errors swallowed without `logger.error()` (`cron-handler.ts` L43-46; `stripe/route.ts` L44-51) | Cron/webhook failures recorded to DB but never surfaced; uncaught route exceptions vanish entirely. Cascading failures invisible until manual `/dashboard/jobs` check | Wire existing `logger.ts` to Sentry/Logtail; add `logger.error` in cron-handler + webhook catch blocks; `/api/cron/health` returning 503 on >20% 24h failure | **M** |
| 6 | **1 `error.tsx` across 832 routes** (only `site-reports/[id]`) | Any server-component throw → framework "Application error" full-screen, no digest, no recovery, for operators/owners/investors | Add group-level `error.tsx` to `(dashboard)`, `(development-app)`, `(owner)`, `(investor-portal)`, `(buyer-portal)` with logged digest + reset() | **M** |
| 7 | **Notification delivery metrics collected, never alerted** (`delivery.ts`; `notification-delivery-job.ts`) | Resend failing 3-5% → job = `partial_success`, owners silently miss booking confirmations for hours/days | Hourly `monitor_notification_failures` cron alerting on failureRate >5%; `/dashboard/jobs` widget | **M** |
| 8 | **Build ignores ALL TS + ESLint errors; no CI gate, no git hooks** (`next.config.mjs` L115-128) | Type errors, lint breaches (incl. the SHAPE-BUG `.rows` guard), broken builds deploy to Vercel silently. Combined with sparse tests = "move fast, break finance" | GitHub Action `typecheck && lint && build` as required check; husky + lint-staged pre-commit; 16GB Enhanced Builds to lift the OOM that forced this | **M** |
| 9 | **Financial engines (`statement-generator.ts`, quote) lack behavioral tests** | Monthly accounting for 30+ villas / millions in payouts validated only by hand/replay; an allocation/fee/FX bug surfaces in production | Unit tests: allocation determinism, ownership-share edge cases (100% pool/direct/hybrid), mgmt-fee + reserve handling, FX. (Note: `quoteForRangePure`/dynamic-pricing ARE tested — gap is statement-generator) | **L** |
| 10 | **Dashboard revenue aggregates untested** (`dashboard-cabinet-queries.ts`, 7 fns incl. `getPortfolioMetrics`, `getOwnersYtdPayouts`, `getRevenueByChannel`) | `OPERATOR_COMMISSION=0.2` / `FX_USD_TO_IDR=15800` embedded in untested SQL; a WHERE/rate change silently breaks KPI tiles | `dashboard-cabinet-queries.test.ts` with seeded data; assert occupancy 0-100, payouts sum across multi-villa owners, channel % sums to 100 | **M** |
| 11 | **Statement generator scopes by villa/project only, no org filter** (`statement-generator.ts` L91-176) | Cross-tenant finance leak if a villa is orphaned/shared; relies on implicit tenancy. Fixed by #1 | Pass `organizationId` to `generateOwnerStatement`; denormalize org onto revenue/fee/expense lines | **L** (folds into #1) |
| 12 | **Impersonation banner shows "viewing as Org B" but middleware never swaps org-id** (`subscription-os/actions.ts` L250-265) | Super_admin troubleshoots Org B while actually viewing Org A — visually deceptive, operationally broken | Complete data-view swap in middleware + write-block under impersonation + strict TTL; OR feature-flag the button off until landed | **L** |
| 13 | **Agent-knowledge upload doesn't validate org-claim** (`agents/knowledge-actions.ts` L54-126) | Super_admin can mislabel Org-A docs as Org-B-scoped or platform-global, corrupting retrieval boundaries | Validate `organizationId` exists + is subscribed before insert; or hardcode `null` and hide the dropdown | **M** |
| 14 | **Quote rate-limiter is in-memory per-lambda** (`api/v1/quote/route.ts` L23-52) | Public API DoS — single IP floods across cold lambdas (3×60 = 180/min); self-documented stopgap | Move to Postgres `rateLimitBuckets` (same pattern as v1 API keys) | **M** |
| 15 | **799 pages force-dynamic; 2 hot pages have unbounded `Promise.all`** (`investor-portal/page.tsx` L37, `development-os/page.tsx` L57 — 6 queries each vs `max:5` pool) | Pool saturation under modest concurrency; TTFB 10s+ on cold start. (Caching is partly handled via `revalidatePath` on mutation, so less severe than raw claim) | Swap to `mapPoolAll([...],4)` (helper exists); selective ISR/`revalidate` on read-heavy operator/portal pages | **S** (the two pages) / **L** (broad ISR) |
| 16 | **No user attribution on legacy AI runs** (`aiAssistantRuns.createdBy` NULL for ~8 legacy agents bypassing `aiExecute()`) | Cost records exist but can't trace a $500 token burst to a person; abuse/compliance blind spot | Route legacy agents through `aiExecute()` or populate `createdBy`; emit `auditEvents` on each run | **M** |
| 17 | **Dates hardcoded `en-GB`/UTC across ~40 pages** (`owner/statements/page.tsx` L288) | Indonesian owner (UTC+8) sees check-ins off by one day; org timezone exists in schema but unused | Thread `organizations.timezone` through owner/dashboard context into `Intl.DateTimeFormat` | **L** |

## 4. Prioritized roadmap

### Now (1-2 weeks)
**Security**
- Field PWA auth gate — `(field)/field/layout.tsx` + verify `listInventoryItems` org-scope (**S**)
- SSRF guard + timeout on calendar-feed fetch (**S**)
- Feature-flag the impersonation "View as customer" button OFF until data-view swap lands (**S**)

**Observability**
- Fix job-status-on-DB-down (`finishJobRun`/notification-delivery) — green-when-broken is dangerous (**S**)
- Add `logger.error` to `cron-handler.ts` + webhook catch blocks (**S**)

**Performance**
- `mapPoolAll(4)` on `investor-portal/page.tsx` + `development-os/page.tsx` (**S**)

**Tech-debt / quality gate**
- GitHub Action: `typecheck && lint && build` as a required check (do this even before fixing every error — flip CI on, fix the backlog behind it) (**M**)
- husky + lint-staged pre-commit (**S**)

### Next (this quarter)
**Data integrity (the keystone)**
- Add `organizationId` to `projects` + `villas`, backfill, filter all ~20-30 query sites — unblocks #2 inventory, #11 statement-gen, dashboard exports (**L**)
- Pass `organizationId` into `generateOwnerStatement` + denormalize org onto revenue/fee/expense/tax lines (**L**, folds into above)
- Period-lock CHECK constraint / `assertPeriodOpen` inside `insertExpenseLine`/`insertManagementFeeLine` (**M**)

**Testing**
- Behavioral tests for `statement-generator.ts` (allocation determinism, share edge cases, mgmt-fee, FX) (**L**)
- `dashboard-cabinet-queries.test.ts` for the 7 revenue aggregates (**M**)
- Retire/migrate the 196 source-scan tests into one `schema-contract.test.ts`; keep the ~24 behavioral suites (**M**)
- Commit visual-regression baselines or remove the no-op workflow (**S**)

**Security / isolation**
- Wire `logger.ts` → Sentry/Logtail + `/api/cron/health` 503 threshold + >3-fails/hr alert (**M**)
- Validate org-claim on agent-knowledge upload (**M**)
- Add RLS policies to the 7 agent tables (defense-in-depth; currently app-filtered only) (**M**)
- Postgres-backed quote rate-limiter (**M**)
- Org-existence check in `toggleOrgAgentSubscription` (**S**)

**Observability / UX**
- Group-level `error.tsx` for the 5 portal/cabinet route groups, starting with `(dashboard)` (**M**)
- `monitor_notification_failures` cron + `/dashboard/jobs` metrics widget (**M**)

**Performance**
- 16GB Enhanced Builds to lift the OOM that forced `ignoreBuildErrors` (cost decision) (**M**)
- Selective ISR/`revalidate` on read-heavy operator + portal pages (**L**)

### Later
**Strategic / tech-debt**
- Consolidate the two pricing subsystems (`ratePlanOverrides` vs `villaRateOverrides`) — add `villas.pricing_mode` flag, migration tool, deprecation timeline, remove legacy code (**L**)
- Complete the impersonation data-view swap (middleware org-resolution + write-block + TTL) (**L**)
- Audit/consolidate dual wallet/ledger systems (`walletTransactions` vs `walletMovements`) (**M**)

**UX / a11y / i18n**
- Thread org timezone + locale through money/date formatting (`formatMoneyMinorByLocale`, `Intl.DateTimeFormat(locale, {timeZone})`) across ~40 pages (**L**)
- Shared `<FormField>` wrapper with `aria-invalid` + `aria-describedby` for auth/confirm forms (entity-form-modal already does this correctly) (**M**)
- Complete investor-portal RU/ID/ZH translations before real onboarding (**L**)
- JSON-LD structured data (Organization/Product/Pricing) + og:image on marketing pages (**M**/**S**)
- Lighthouse CI budget for landing pages (**L**)

**Pricing/data type safety**
- Change legacy pricing `mode:'number'` → `mode:'bigint'` on `ratePlanSeasons`/`ratePlanOverrides` and propagate through quote engine (**M**)
- Migrate AI model `RATES` to a DB table to avoid code-deploy on provider price changes (**M**)

## 5. Quick wins (do first — high impact, low effort)

1. **Field PWA auth gate** (S) — closes an unauthenticated inventory-data leak today.
2. **SSRF guard + timeout on calendar feeds** (S) — closes a metadata-credential exfil vector.
3. **Job-status-on-DB-down fix** (S) — stops the runner lying "success" during an outage; pattern already exists in calendar-sync-job.
4. **`mapPoolAll(4)` on the two unbounded pages** (S) — helper already exists; immediate TTFB win under load.
5. **`logger.error` in cron-handler + webhook catches** (S) — makes silent failures visible the moment Sentry is wired.
6. **Flip CI on** (`typecheck && lint && build` required check) (M but high leverage) — stops the next broken-type/lint deploy even while the backlog is burned down behind it.
7. **Org-existence check in `toggleOrgAgentSubscription`** (S) — trivial lookup, prevents silent data corruption.

## 6. Strategic bets

1. **The `organizationId` tenancy backbone.** This is the single highest-ROI investment. Adding denormalized `organizationId` to `projects`/`villas` is the root fix that simultaneously closes the field-inventory leak, the statement-generator cross-tenant risk, and the latent export/admin-search exposure across ~60 transitively-scoped tables. Everything else in "Security/Data integrity" either depends on or is de-risked by this. Plan it as a dedicated migration + backfill + query-site sweep, with an RLS layer added behind the app-level filtering for defense-in-depth.

2. **A real test pyramid for the money engines + a CI that enforces it.** Today there's an *illusion* of coverage (6,210 assertions, 90% source-scan theater, suite not even green) over engines moving millions. The bet: retire the source-scan tests, write behavioral suites for `statement-generator` (the one genuinely untested critical engine — quote/dynamic-pricing are already covered) and the dashboard revenue aggregates, then gate them in CI alongside typecheck/lint. This converts "manual discipline by one developer" into an automated safety net and is the prerequisite for confidently refactoring finance code.

3. **An observability spine for 108 cron jobs + financial workflows.** The framework is already there (`job_runs`, `jobRunEvents`, redacting `logger.ts`) — it's just not connected to anything that pages a human. Wiring Sentry/Logtail, a `/api/cron/health` endpoint, notification-failure alerting, and group-level error boundaries turns a system that "silently completes while degraded" into one where failures are seen within minutes. Pair this with consolidating the **dual pricing/override systems** as a follow-on tech-debt bet: two parallel override mechanisms (`ratePlanOverrides` keyed to ratePlanId vs `villaRateOverrides` keyed to villaId) with implicit migration is a correctness and operator-confusion hazard that compounds as villa count grows — introduce an explicit `villas.pricing_mode` flag and a deprecation timeline before it becomes load-bearing.

</details>

---

## F. Benchmark backfill (villa-mgmt · construction-PM · AI-CRM · accounting)

Each function benchmarked against its category leaders. `weHave`: **full** = at/above parity · **partial** = exists but incomplete/unwired · **none** = absent.

### F.1 Short-term-rental / villa management OS — vs **Guesty · Hostaway · Lodgify · Hostfully**

**Headline → Ship live two-way OTA channel push (rate + availability + reservation import).** Without real distribution, our deep ops/owner stack cannot compete as a management OS — this is the single P0 unlock.

*Our position:* an unusually deep operational + owner-facing stack (front office, housekeeping/maintenance/preventive ops with a field PWA, owner statements with pooling/quota, guest portal with AI concierge, dynamic pricing) that **rivals or exceeds the leaders on villa-operations and owner-relations depth**. But we are **not yet a true channel manager**: OTA rate/availability push is stubbed (sync is pull-only iCal), inbound WhatsApp and most payment rails (Wise/PayPal/Xendit) are stubs, and unified inbox/automation are absent — so today we cannot actually distribute listings or transact at parity.

| Capability | We have | Priority | Gap → recommendation |
|---|---|---|---|
| **Two-way OTA channel manager** (rate+availability+reservation push to Airbnb/Booking/Vrbo/Expedia) | partial | **P0** | Build live push on the existing pricing engine + calendar. Start Booking.com Connectivity API + Airbnb API (or license an aggregator: Nuitée/MyAllocator/Rentals United) to turn pull-only iCal into true two-way sync w/ reservation import. |
| **Unified guest messaging inbox** (Airbnb/Booking/WhatsApp/SMS/email + templates + automation) | partial | **P0** | Wire inbound WhatsApp (Twilio/Meta Cloud API) + channel inboxes into one threaded inbox; expose the AI concierge as suggested replies; add lifecycle-triggered message automations. |
| **Payments / merchant-of-record** (multi-gateway, multi-currency, deposits, schedules, security holds, payouts) | partial | **P0** | Promote Wise/PayPal/Xendit from stubs to live (critical for SE-Asia); add payment schedules, pre-auth security deposits, automated owner payout disbursement tied to the statement engine. |
| **Visual workflow/automation engine** (trigger→action across bookings/ops/messaging/payments) | none | P1 | Event-driven rules engine (booking confirmed → cleaning task + pre-arrival message + schedule balance charge). Domain events already emitted via ops/notifications — expose as triggers + action catalog. |
| **Direct-booking website / booking engine** (own-brand storefront) | partial | P1 | Harden direct bookings into a brandable multi-property storefront w/ availability search, instant book, integrated checkout — a marketing-grade channel, not an internal flow. |
| **Channel-aware revenue management** (dynamic pricing distributed to OTAs) | partial | P1 | Connect pricing-engine output to the new channel-push layer so computed rates reach OTAs; add market/comp-set demand signals (or PriceLabs) to validate externally. |
| **Open API + webhooks + app marketplace** | none | P1 | Publish a documented REST API + webhooks (internal events already exist) → unlocks lock/IoT, accounting, pricing integrations without building each natively. |
| **Reviews management** (automated solicitation + response) | none | P2 | Reviews module: post-checkout review requests via the messaging/automation layer, aggregate channel reviews, AI-drafted responses. Low cost once inbox+automation exist. |
| **Owner portal & reporting / trust accounting** | **full** | P2 | *Relative strength* (statements + owner-stays w/ pooling/quota exceed several leaders). Maintain + market; add owner self-service blackout/booking requests + tax-ready statements to extend the lead. |
| **Smart-lock / IoT access & guest verification** | none | P2 | Integrate ≥1 smart-lock (RemoteLock/August) + guest-screening/deposit provider (Autohost/Superhog), wired to check-in events. Common buyer requirement for unattended villas. |
| **Accounting export integrations** (QuickBooks/Xero, reconciliation) | partial | P2 | Add QuickBooks/Xero export + reconciliation on the statements/utilities data so PMs close books without re-entry. |
| **Native mobile app** (managers/owners + offline field ops) | partial | P2 | Extend the existing field PWA toward an installable owner/manager experience (push, offline) rather than a separate native app first. |

### F.2 Construction project management (Development OS) — vs **Procore · Fieldwire · Buildertrend · CoConstruct**

**Headline → Ship the closed-loop coordination triad — RFIs, submittals, punch-list — anchored on the already-built `DrawingViewer`** so markup/takeoff/field-issues live on the plans. Without these named modules + a mounted drawing surface, we cannot be taken seriously against Procore/Fieldwire regardless of how strong our cost/field spine is.

*Our position:* a genuinely strong field-execution + procurement spine (real site reports w/ crew/zones/blockers, safety + QA/QC, a BOQ ledger w/ import + BOQ→RFQ bridge, materials/PO, purchase requests, vendors, inventory/warehouse, projects/contracts model) that **rivals the field+cost half of Procore/Fieldwire**. But the project-coordination loop is missing: no RFIs/submittals/punch-list as first-class modules, a `DrawingViewer` built yet **mounted nowhere**, BOQ-detail + contract + productivity UIs absent, schedule hub only partly wired.

| Capability | We have | Priority | Gap → recommendation |
|---|---|---|---|
| **RFIs** (routing, ball-in-court, due dates, audit trail) | none | **P0** | Build an RFI module reusing site-report/blocker patterns: numbered records, assignee + ball-in-court, due date, status workflow, drawing/zone linkage, response thread. Anchor each to a drawing pin. |
| **Submittals / shop-drawing approval** | none | **P0** | Submittals register seeded from BOQ/spec lines, approval state machine (prepare→review→approve/revise/reject), revision history, vendor/PO links so approvals gate procurement. Leverage BOQ→RFQ bridge. |
| **Punch list / snagging** (on-plan pins, photos, assignment) | partial | **P0** | Promote blockers/QA-QC defects into a named punch-list w/ photos, plan pins, crew/vendor assignment, verify/close sign-off. Much of the data model exists. |
| **On-screen plan/drawing viewer** (markup + pin-drop) | partial | **P0** | **Mount the already-built `DrawingViewer`** into a Plans/Drawings route + wire pin-drop/markup persistence. Highest-leverage existing asset — unlocks RFI/punch/submittal anchoring. |
| **BOQ line detail editing + cost tracking** (estimate vs committed vs actual) | partial | **P0** | Build the BOQ line detail editor; join to POs/PRs so each line shows budget vs committed vs actual variance. Ledger/import/PO data exist — mostly UI + a rollup query. |
| **Quantity takeoff from drawings → BOQ** | partial | P1 | Extend the mounted viewer w/ measurement tools writing quantities back to BOQ lines. Defer until viewer mounted + BOQ detail editing exists. |
| **Scheduling** (Gantt, dependencies, critical path, baselines) | partial | P1 | Finish the schedule hub: dependencies + Gantt/lookahead on existing calendars/resources; link tasks to crews + drawing pins. Prioritize dependency logic. |
| **Daily logs / field reports** (weather, manpower, progress photos) | **full** | P2 | We already have real site reports; enrich w/ auto weather + photo timeline to reach parity. Low effort, high polish. |
| **Change orders / variation management** | none | P1 | Change-order object capturing cost/time impact, approval routing, auto-revising BOQ budget + contract value. Depends on contract detail + BOQ editing landing first. |
| **Contract management** (detail pages, document/financial linkage) | partial | P1 | Build the missing contract detail page on the existing model, linking BOQ scope, change orders, POs. Foundational for change orders + owner financials. |
| **Crew/labor productivity tracking** | partial | P2 | Surface existing productivity data (no UI today) as dashboards: installed qty vs planned hours per BOQ line/crew. Reporting layer only. |
| **Mobile-first field app w/ offline capture** | partial | P1 | Ensure the `(field)` route group supports offline capture+sync for daily logs, punch items, photos. Cross-cutting once punch/RFI ship. |

### F.3 AI CRM / conversational + agentic assistants — vs **Salesforce Agentforce · HubSpot Breeze · Intercom Fin · Lindy**

**Headline → Make the agents real and let customers reach them:** convert the 14 stub agents to live model-backed runs, ship the 6 flagship founder-named assistants on the existing chassis, and deploy them omnichannel (WhatsApp + public web) with autonomous act-on-behalf actions. **The chassis is strong, the product is hollow — close that gap first.**

*Our position:* an unusually strong agent chassis for a vertical SaaS — CRUD registry, per-org subscriptions, knowledge-doc RAG, run telemetry, in-platform test chat, hard cost/quota + safety/redaction guards — genuinely competitive *plumbing*. But hollow where it counts: **14 of 35 agents are stubs** that return hardcoded/empty output before the model is called, **all 6 flagship founder-named assistants are missing/stubbed**, there is no self-serve "add custom agent" UI, agents can't be invoked from the workflow pages they belong to, and there is no autonomous act-on-behalf or omnichannel deployment.

| Capability | We have | Priority | Gap → recommendation |
|---|---|---|---|
| **Agents actually call the model** (no stubs) | partial | **P0** | Triage the 14 stubs: kill/de-list the orphans, wire the high-value ones to the chassis (prompt+RAG+telemetry). Add a CI/smoke check that fails if a "live" agent returns before the model is called — stubs can never masquerade as shipped. |
| **Flagship/branded vertical assistants** (the 6 founder-named) | none | **P0** | Ship in priority order on the chassis: supervisor-AI (WhatsApp+vision triage), daily-digest, autonomous concierge routing, real-estate public chatbot, Indonesia tax roll-up, weekly materials planner. Start daily-digest + real-estate chatbot (lowest risk, highest demo value). |
| **Omnichannel deployment** (WhatsApp/web/email/SMS) | none | **P0** | Channel-adapter layer over the chassis: start w/ a public web-chat embed (real-estate) + a WhatsApp inbound webhook (supervisor-AI). Normalize to one message envelope so any agent → any channel. |
| **Autonomous act-on-behalf** (agentic tools, not just chat) | none | **P0** | Typed tool/action registry (create task, route to staff, update booking, send WhatsApp) gated by existing cost/quota + redaction + per-tool permission scopes. Begin read + low-risk writes, approval step for high-risk. |
| **In-context invoke from workflow pages** | none | P1 | "Ask/Run agent" affordance on bookings/maintenance/finance/materials pages, calling the chassis w/ page context pre-loaded. Converts test-chat plumbing into real in-product use w/ minimal new backend. |
| **Self-serve custom-agent builder** (no-code) | none | P1 | "Add custom agent" admin UI over the CRUD: name, system prompt, model, knowledge docs, tools, quota caps — eliminating the SQL+code requirement. Single biggest expansion-revenue unlock; also how the 6 flagships ship. |
| **Human-in-the-loop handoff & escalation** | none | P1 | Confidence-based escalation routing a stuck conversation to the right staff w/ full transcript + RAG citations, tied to the omnichannel layer so handoffs work on WhatsApp/web alike. |
| **Proactive / scheduled agents** (digests, monitors, triggers) | partial | P1 | Stand up daily-digest + weekly-materials-planner as scheduled runs through the existing job/cron infra, writing to a digest surface / pushing to a channel. Mainly need the scheduler→agent binding. |
| **Answer-quality eval, grounding metrics & feedback loop** | partial | P2 | Extend run telemetry into an eval layer: thumbs + resolution per run, golden-question regression set per agent, grounding/citation check. Surface deflection + resolution dashboards. |
| **Multi-agent orchestration / supervisor routing** | partial | P2 | Generalize supervisor-AI into a router that classifies inbound + delegates to the right specialist (concierge/maintenance/finance), reusing the action registry rather than hand-coded routing. |
| **CRM/system-of-record write-back & deep integrations** | partial | P2 | Expose domain entities (bookings, owners, units, finance) as first-class agent tools w/ read/write; add 1-2 external connectors (WhatsApp Business API, accounting export). Prioritize internal write-back — we own the data model. |

### F.4 Accounting / CFO (incl. Indonesia tax) — vs **QuickBooks Online · Xero · Zoho Books · Accurate Online / Jurnal by Mekari (ID)**

**Headline → Stand up a real double-entry general ledger** (COA + balanced journals auto-posted from existing transactions/invoices). It is the missing foundation that unlocks balance sheet, reconciliation, audit trail, and Indonesia tax filing. Without it we are an operational-finance dashboard, not an accounting system.

*Our position:* a credible operational-finance layer (real transactions ledger, invoices w/ payment, project-level P&L, distributions/waterfall, commitments, cron-driven cashflow forecast, money in bigint minor units). But **not yet a true accounting platform**: no double-entry GL or balance sheet, no bank feeds/reconciliation, no AP/AR aging, only read-only Indonesia tax with no e-Faktur/e-Bupot filing, and several flows (shared-cost allocation, document extraction) stubbed/unwired.

| Capability | We have | Priority | Gap → recommendation |
|---|---|---|---|
| **Double-entry GL + chart of accounts** (trial balance, journals) | none | **P0** | `chart_of_accounts` + `journal_entries`/`journal_lines` (debit/credit bigint minor, must net to zero) + posting rules auto-generating balanced journals from existing transactions/invoices/payments. Prerequisite for everything below. |
| **Financial statements: Balance Sheet & Trial Balance** | partial | **P0** | Once GL exists, derive Balance Sheet + Trial Balance from account balances by date; extend the project P&L to a consolidated, period-locked P&L + position statements (assets/liabilities/equity). |
| **Bank feeds + automatic reconciliation** | none | **P0** | Bank-statement import (CSV/OFX first, then feeds; for ID: BCA/Mandiri formats), a reconciliation table linking bank lines → ledger, match/confirm UI. The trust anchor accountants demand. |
| **Indonesia e-Faktur (PPN) + e-Bupot (PPh) filing** | partial | **P0** | We have tax types + read-only reports — close the loop: Coretax-compatible e-Faktur export, e-Bupot withholding certs, NPWP validation, input/output PPN ledger, regenerate + mark-filed lifecycle. Without filing we're a reporting toy for ID entities. |
| **AP/AR aging + collections** | partial | **P0** | We have invoices + payment but no aging/AP. Add bills (AP), 30/60/90 aging for AR+AP, automated dunning, a payables run. Critical for cash control across many owner entities + vendors. |
| **Tax-report lifecycle** (regenerate + mark-filed + period lock) | partial | **P0** | Promote tax reports from read-only to stateful: regenerate from current ledger, mark-filed w/ DJP reference, lock the period so a filed return can't retroactively change. Pairs w/ e-Faktur/e-Bupot. |
| **Shared-cost / inter-entity allocation** (wire the proposer) | partial | P1 | The allocation proposer exists but is **unwired** — connect end to end: persist proposals, approve step, posting that generates offsetting journals. High leverage — hard logic already written. |
| **Cashflow forecast** (create/promote/scenario UI) | partial | P1 | The cron computes a forecast but there is no UI to create/edit/promote scenarios. Add a forecast workbench: manual line adjustments, scenario branches, budget-vs-actual. Differentiator given our project/commitment data. |
| **Document/receipt extraction w/ approve-reject posting** | partial | P1 | Extractions exist but have no approve/reject + don't post. Add a review queue (approve → posts to AP/expense + journal; reject → discard). Turns data capture into real bookkeeping automation. |
| **Multi-currency** (full revaluation, realized/unrealized FX, gain/loss accounts) | partial | P1 | Add per-document + settlement-date rates, realized FX gain/loss postings, period-end revaluation job → FX gain/loss accounts. Essential for USD/IDR/EUR owner entities to be auditable. |
| **Audit trail, period close, role-based financial permissions** | partial | P1 | Append-only audit log on ledger/journal/invoice mutations, a period-close lock, finance-specific RBAC. Needed before external accountants/auditors sign off in a multi-tenant context. |
| **Accountant export / tax-pro handoff** (SPT, GL export, integrations) | partial | P2 | Clean accountant export: full GL, journals, trial balance, ID SPT-ready bundles (CSV/XML) + an external-accountant role. Lowers switching cost; lets firms keep their tax workflow on our data. |

### F.5 AI CRM-of-record — vs **Attio** (AI-native CRM)

**Headline → We already own the hard parts Attio can't touch** — a real off-plan transaction backbone, a governed AI chassis, a scoped public API (`/api/v1`), and live Google Workspace OAuth — **but our AI is a framework without engines** (14/35 agents are stubs, all 6 founder assistants missing, agent tools are read-only with no act-on-behalf) **and we lack Attio's no-code table stakes**: a flexible data model, a workflow builder, and self-serve agent creation. Fix the AI workforce + add no-code configurability; don't chase Attio on generic breadth.

*Our position:* Attio is a *horizontal* AI-native CRM-of-record (reshapeable object/record database, no-code automation builder, autonomous research/enrichment agents, email+calendar sync with sequences, self-serve reporting, open API). We're a *vertical* ops platform whose "CRM" is a domain-specific off-plan transaction backbone (contacts→leads→reservations→contract-groups→milestones→invoices→discount chain→reminder engine, dual-currency USD/IDR with FX) that Attio can't replicate out of the box. The strategy is not to out-Attio Attio — it's to finish the AI engines the chassis already supports and add the no-code configurability that turns a vertical tool into a platform.

| Capability | We have | Priority | Gap → recommendation |
|---|---|---|---|
| **No-code automation / workflow builder** (trigger→condition→action) | partial | **P0** | No workflow builder exists. Adjacent + reusable: the real reminder engine (`devNotificationRules` w/ triggerEvent/offset + templates + delivery log) and the HMAC webhook emitter (`emitEvent`). Generalize into a trigger→condition→action builder over the existing rules tables, exposing events already emitted (lead created, milestone overdue, contract signed); reuse the agent tool framework as the action library. This is what converts "dashboards" into "workbenches." |
| **Autonomous AI research / enrichment agents** (act-on-behalf) | partial | **P0** | Chassis is strong (RAG + tool-loop, budget gate, telemetry, Vault keys) but the tool registry exposes only **read-only** getters wired to 2 agents — no agent can write back. Add write/act tools (`update_lead_score`, `draft_offer`, `enrich_contact`, `post_note`) under the existing allowlist + the existing inbox approval-queue. Attio's signature capability + the founder's explicit bar. |
| **Founder-named assistants actually working** | none | **P0** | All 6 missing/stubbed. Ship `daily-digest` end-to-end as the template (its tool factories + `runAgentWithTools` loop already exist), then clone. Wire inbound WhatsApp (webhook exists) → concierge agent as the highest-leverage second build. |
| **Self-serve "add custom agent" UI + scheduler** | partial | P1 | New agents need a SQL row **and** a code commit (`registry.ts` is a hardcoded const array). The admin CRUD can edit but not create net-new. Build an "add custom agent" wizard (name, system prompt, model, budget, tool allowlist, cron) writing config rows only — no deploy. Genuinely differentiated: even Attio doesn't self-serve custom agents this deep. |
| **Flexible custom-object / custom-field model** (no-code attributes) | none | P1 | Our model is hardcoded Drizzle tables (great for off-plan accuracy, zero end-user extensibility). Add a `custom_fields` jsonb + org-scoped attribute-definition table (key/label/type/options/target) + a generic attribute editor on contacts/leads — bolt flexibility onto the CRM-facing entities; keep the typed transaction backbone authoritative. |
| **Email & calendar sync → record timelines** | partial | P1 | The hard part is done: real Google Workspace OAuth (Calendar+Gmail+Sheets+Drive scopes) persisted to `oauth_connections` + a contacts `interactions` table. Missing: the sync worker that pulls Gmail threads / Calendar events and auto-logs them onto the contact/lead timeline by email match. |
| **Self-serve reporting / dashboards** (over any object) | partial | P1 | We have rich *purpose-built* dashboards (better than generic charts for a vertical) but hardcoded server queries. Add saved-views + a narrow report-builder over the leads/contracts pipeline (group-by stage, sum estimated_value, funnel) so sales managers slice without an engineer. |
| **Demand capture / web-to-lead intake** | partial | P1 | Leads table is well-modeled (full UTM + multi-touch attribution) + a public `POST /api/v1/leads` that emits a webhook. Missing: hosted web-to-lead forms + auto-assignment/routing (reuse the notification-rule trigger engine). |
| **Open REST API + webhooks + integrations** | partial | P2 | *Relative strength, near parity:* real scoped `/api/v1` (API-key auth, scope checks, rate limit, request audit) + HMAC-signed `webhook_subscriptions`. Gaps: no published docs/SDK, read-heavy CRUD, no self-serve API-key/webhook management UI. Document the API + add a key/webhook management screen + broaden write coverage. |
| **Email sequences / cadences / drip** | none | P2 | No cadence engine. Lower priority for high-touch off-plan sales (not high-volume SDR). If built, layer on the same notification-rule + Gmail-send infra, not a separate system. |

---

## G. Action-verb functionality audit (add / edit / delete / cancel / connect / disconnect)

A second multi-agent pass (25 agents, 1,034 tool-uses, adversarially verified) that — unlike §D's screen-level REAL/PARTIAL/MOCK — traced **every mutation verb on every surface** from control → handler → DB/external-service, with `file:line` evidence on both ends. This is the answer to "does every button actually work."

### G.1 The numbers (676 action-cells across 12 areas)

| Status | Count | % | Meaning |
|---|---|---|---|
| **works** | 389 | 58% | reachable control → handler → real DB/external mutation |
| **partial** | 134 | 20% | **action exists in code & does a real write, but NO UI control reaches it** (or half-wired: optimistic-only/alert/"not implemented") |
| **missing** | 72 | 11% | verb expected, no control AND no action |
| **read-only** | 38 | 6% | intentionally read-only surface |
| **disabled** | 23 | 3% | visible control hard-disabled / "coming soon" |
| **n/a** | 20 | 3% | verb doesn't apply |

**At the verb level the platform is ~58% operable, not 65%.** The dominant, cheapest-to-fix gap is the **20% "partial"** — the backend is already built and writes to the DB; only the button is missing.

By verb (works / partial / disabled / missing):
- **create** 95 / 35 / 5 / 11 · **edit** 46 / 15 / 2 / 15 · **delete** 29 / 6 / 0 / 2 · **cancel** 13 / 12 / 0 / 2
- **connect** 19 / 8 / 0 / 10 · **disconnect** 19 / 1 / 0 / 6 · **send** 14 / 13 / 3 / 1 · **upload** 7 / 5 / 2 / 7
- **approve** 32 / 11 / 1 / 3 · **mark-paid** 7 / 3 / 0 / 3 · **refund** 1 / 1 / 1 / 1 · **toggle** 41 / 10 / 3 / 1

### G.2 The #1 finding — orphaned server actions (built backend, no button)

Over and over the auditors found *"action X exists (real `db.insert`/`db.update`) but grep across `*.tsx` returns zero callers."* This is a **wire-up sweep**, not feature-building — the highest ROI on the whole platform. Representative (not exhaustive) list:

**Development OS — Sales/Contracts (almost the entire post-create lifecycle is orphaned):** `extendReservationExpiry`, `markReservationPaid`, `cancelReservation`, `convertReservationToContract` (form component never mounted), `signContract`, `cancelContractGroup`, `issueInvoiceForMilestone`, `sendInvoice`, `recordInvoicePayment`, `voidInvoice`, `approveDiscount`, `rejectDiscount`, `applyDiscountToContract`.
**Dev OS — Marketing:** `createCampaign`, `transitionCampaignStatus`, `createContentVariant`, `transitionContentStatus` (publish), `recordConsent` — all real, zero UI.
**Dev OS — Finance/Capital:** transaction reconcile/split/commitment-link, `voidInvoice`/send, tax-report regenerate, shared-cost propose/reverse, cashflow generate + promote-to-active, commitment add/edit/cancel/drawdown, distribution edit, profitability recompute, revenue-stream log.
**Dev OS — Site/Schedule/QS:** `recordProductivityLog` (page is prose, no form), `createCalendar`/`editWorkingCalendar`/`archive`, `createResourcePool`/`assignResourceToTask`, `setSafetyIncidentStatus`/`resolveSafetyIncident`, `attachQaQcPhoto`, `transitionBoqStatus` (BOQ status read-only), `recordMaterialConsumption`, `createSiteZone`, `cancelMaterialPO`, `markDeliveryQualityChecked`, vendor `recordVendorPerformance`/`terminateVendorEngagement`, `transferInventory`, `createInventoryLocation`.
**Management OS:** `assignOperationTaskAction`, `createServiceRequestAction`, `createInventoryCategoryAction`, `cancelPurchaseOrderAction`, `archiveGuestAction`/`unarchiveGuestAction`, `updateRatePlanAction`, owner `OwnerProfileForm` action (built, page read-only), investor wallet withdraw/reinvest (working flow behind a disabled button), risk-radar `acknowledgeAlert`/`resolveAlert`, project-cycle `reviewCycleRecommendation`, assets `updateAssetAttributes`/`changeAssetType`.

> Fix pattern: each is an afternoon — mount a button/form that calls the existing action + `revalidatePath`. A focused "wire-up sweep" could flip dozens of cells from partial→works with near-zero new backend.

### G.3 Connect / disconnect — three tiers (the founder's "1820" question, answered)

**Tier 1 — FULLY REAL (persisted creds + live service call + connect *and* disconnect in UI):**
- **OTA Channel Manager** `/development-os/channels` — `ConnectChannelModal` → encrypts creds (STAY_LINK_KMS_SECRET) → `provider.testConnection()` against the live OTA **before** persisting → Archive = disconnect. Real HTTP clients for Airbnb/Booking.com/Agoda/Expedia/Trip.com/VRBO/Hotels.com. *(Correction to §A: the OTA **connection** is real; only **rate/availability push** is the stub — `channel-push-stub.ts` writes `status='simulated'`.)*
- **Stripe** payment processor `/dashboard/payments/providers/new` — real `getAccount()` test + archive disconnect.
- **Banking** `/development-os/banking` — Revolut/Wise hit live APIs; Mandiri/BCA are manual-CSV-import shells; disconnect real.
- **Marketing** `/development-os/marketing/connections` — GA/Meta Pixel/Google Ads/Meta Ads real connect+test+disconnect.
- **Per-org AI agent keys** `/dashboard/settings/ai-agents/[key]` — encrypted key store + test + clear.
- **Platform agent → org subscription** `/platform/agents/[id]?tab=subs` — `toggleOrgAgentSubscription` connect/disconnect.
- **Platform agent knowledge docs** — upload → Storage + embed→pgvector; delete/reprocess. **Platform agent API key** — Supabase Vault rotate/remove.
- **iCal calendar feeds / villa→channel** `/dashboard/integrations/calendar-feeds` — real `fetch()` of the feed; pause/archive disconnect.
- **Outbound webhooks** — HMAC-signed; auto-disable after 10 failures.

**Tier 2 — CONNECT-BUT-FAKE (UI lets you "connect," creds persist, but nothing real happens):**
- **Payments Wise / PayPal / Manual** → fall through to `DryRunPaymentProvider`. ⚠️ **`DryRun.testConnection` returns `connected:true` unconditionally → a false-green "Connection verified" banner with zero external call.**
- **Bank Plaid / manual** → DryRun.
- ⚠️ **Credentials for payments/banking/marketing are stored PLAINTEXT** in JSONB (code comment defers encryption) **despite the Integrations hub claiming "AES-256-GCM encrypted at rest."**

**Tier 3 — CAN'T CONNECT (the exact "displays data, no way to connect" anti-pattern):**
- **Messaging (WhatsApp/Telegram/IG/Messenger/SMS/Email)** — real providers exist but runtime reads creds **only from env vars**; there's no in-app connect that the runtime honors, and no disconnect. ⚠️ The one WhatsApp credential form **persists encrypted Twilio creds that the runtime then ignores** ("env vars take precedence") — a connect that silently does nothing.
- **`/development-os/communications`** — the literal "1,820 WA messages" mock; both buttons hard-disabled "Coming soon"; no connect anything. *(This is the founder's exact example — confirmed in code.)*
- **Concierge cabinet** — staff "Send" writes only to the in-portal message table; never delivered to WhatsApp/email.
- **Smart-lock / door-code** — explicit no-op stub (deterministic code, no lock vendor).
- **Settings → Integrations hub** — read-only env-var status board; **2 dead links** (`/dashboard/integrations/channels` and `.../resend` don't exist on disk).
- **Notification providers (Resend/Twilio)** — platform env only; no per-org connect/disconnect.
- **`/platform/billing` + `/platform/support`** — landing cards link to routes that don't exist (no Stripe Connect anywhere).

### G.4 Dead buttons (hard-disabled "coming soon")

CFO cabinet (Tax-pack PDF, +Journal entry) · Procurement cabinet (+Purchase request) · Site Supervisor cabinet (Submit for sign-off, +Photo) · QS cabinet (Export XLSX, Compare REV, +Change order) · Communications (Export, +Template) · Strategic (Export, +Scenario) · Concierge (Templates, Memory, Review-handoffs) · Front office (Day report) · Operations (Brief team) · Booking charge (Refund) · Owner preferences (Manage 2FA) · Investor dashboard (AI copilot, mounted without `askHref`).

### G.5 Verify pass — overclaims caught (auditors held to account)

Of the risky "works" claims re-checked adversarially, 6 were downgraded:
- ⚠️ **Payouts queue "mark-paid"** → **refuted**: `setPayoutLineStatusAction` is real but **has no UI caller** (unreachable). [→ G.2]
- **CFO cabinet "import"** → adjusted: it's just nav `<Link>`s to `/finance/transactions/*`, not an owned import.
- **Payment processor connect** → adjusted: works for Stripe only; Wise/PayPal/Manual persist but test is DryRun. [→ G.3 Tier 2]
- **Investor login "connect"** → adjusted to partial (Supabase login, not a per-service connect).
- Owner-statements **send** + transparency **approve** → re-confirmed as genuinely working.

### G.6 What this adds to the build plan — a new P0 theme

The action audit reorders the roadmap. Before building anything new, the cheapest path to "every function works":

1. **🔴 P0 — "Wire-up sweep" (NEW, highest ROI):** mount buttons/forms for the ~134 orphaned actions in §G.2. Mostly afternoons each; flips ~20% of the platform from partial→works with near-zero new backend. Batch by area (start: Sales/Contracts lifecycle, then Marketing campaigns/content, then Dev-OS finance writes, then Mgmt-OS ops assign/create).
2. **🔴 P0 — Fix the lying connects (trust/security):** (a) DryRun `testConnection` must **not** report success — return `mode:'dry_run'`; (b) **encrypt** the plaintext payment/bank/marketing creds (the UI already claims it); (c) make the WhatsApp credential form's creds actually drive the runtime (or remove the form). 
3. **🔴 P0 — Real messaging connect:** persist per-org messaging creds the runtime honors + a connect/disconnect UI; replace `/communications` mock with the real `/whatsapp` surface. Directly closes the founder's "1820" example.
4. **🟠 P1 — Fill the true gaps:** the 72 "missing" verbs (buyer payments/documents routes, BOQ inline edit, guest dedupe, checklist templates, utilities payments, add-custom-agent UI, etc.) — these need both action + control built.
