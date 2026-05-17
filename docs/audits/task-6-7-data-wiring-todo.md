# Task-6-DATA + Task-7-DATA — Live data wiring for the 5 Mgmt + 7 Dev cabinet visual ports

## Context

Sprints `_handoff/` Task 6 + Task 7 split into two phases on operator
decision:

- **TASK-6-VISUAL** + **TASK-7-VISUAL** (shipped) — 1:1 visual ports
  of all 12 cabinets:
  - Mgmt: `_handoff/management/{bookings,concierge,finance,operations,
    ai-hub}.html` (+ Overview wired live in commit `95501b1`)
  - Dev: `_handoff/development/{index,project-manager,cfo,qs,
    procurement,site-supervisor,ai-agents}.html`
  Each prototype's hard-coded demo arrays preserved verbatim and
  flagged with `// TODO(task-6-data):` (Mgmt) or `// TODO(task-7-data):`
  (Dev) comments at the point of use.
- **TASK-6-DATA + TASK-7-DATA** (this document) — replace those
  mock arrays with server-fetched data from the existing `features/*`
  services, or introduce a single new service per cabinet where the
  existing surface isn't authoritative yet.

The Overview cabinet (`src/app/(dashboard)/dashboard/page.tsx`) was
already wired in commit `95501b1` and is **not** in this TODO — it
reads `getLiveDashboardCounts()` + `getCurrentAppUser()` live and uses
`portfolioMetrics` / `revenueByChannel` / `monthlyRevenueStrip` /
`mockProjects` / `mockOwners` mocks where no live equivalent ships
today.

## How to read this doc

For each cabinet I list:

- **File** — the page that needs the wiring
- **Mock arrays in the file** — what's currently TODO-flagged
- **Target service function(s)** — what to call. ⚡ marks services
  that don't exist yet and need to be created. ✅ marks ones that
  already exist.
- **Complexity** — Low (1-3 read queries), Med (4-8 + light shape
  mapping), High (joins / aggregations / new schema needed)

## Cabinet 1 — Bookings — ✅ DONE (TASK-6-DATA-PART-1)

**File:** `src/app/(dashboard)/dashboard/bookings/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `BOOKINGS` (9 rows) | `listBookings({ status, project, channel, limit })` | ✅ exists at `src/features/bookings/services.ts` | Need to shape DB row → prototype shape (code/guest/villa/ch/in/out/nights/gross/state/vip/lang). `state` enum maps directly. `gross` formatting can be a small helper. |
| `RATE_PLANS` (4 rows) | `listRatePlans()` | ✅ exists at `src/features/pricing/services.ts` (rule-sets surface) | The `Rate plans · active` panel shows base + multipliers + MLOS. The existing pricing rule-set shape is richer (per-villa + channel-set + season ranges). Reduce to the 5-column prototype view. |
| `CHANNEL_HEALTH` (6 rows) | `getChannelHealth()` | ⚡ new service needed | Aggregates per-channel: connection state, last-sync timestamp, conflict count (from `bookings.channel_conflicts` or equivalent), MTD revenue share. Realistic source: cron output table. **Complexity: Med.** |
| `CALENDAR_VILLAS` (8 villas × N blocks) | `getCalendarStrip({ from, days })` | ⚡ new service needed | Returns per-villa block list for the next 14 nights. Sources: bookings, owner stays, maintenance OOO blocks. **Complexity: Med-High** (3 sources to merge). |
| Conflict resolver text (ES-S5 / Booking.com) | `listOpenChannelConflicts()` | ⚡ new service needed | One row per active conflict with action options. **Complexity: Med.** |
| 5-up KPIs (Bookings MTD / ADR / Lead time / Conflicts / Cancellation) | `getBookingsKpis({ period })` | ⚡ new service needed | Composite read. Mostly aggregations over existing `bookings` rows. **Complexity: Low-Med.** |

**Sprint estimate:** 1 day for an ops engineer familiar with the
existing bookings service. The calendar strip is the riskiest piece
(3-source merge + DST handling).

## Cabinet 2 — Concierge

**File:** `src/app/(dashboard)/dashboard/concierge/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `SESSIONS` (6 rows) | `listActiveSessions()` | ⚡ new at `src/features/guest-ai/services.ts` | Returns active + recent sessions across channels (WhatsApp, in-stay portal, email). Shape: id/guest/villa/lang/started/msgs/status/last. **Complexity: Med** — relies on per-channel adapters. |
| `HANDOFFS` (2 rows) | `listHandoffs({ status: "open" })` | ⚡ new service needed | Filtered from sessions where status was escalated. Shape: id/from-session/villa/who/text/priority/assigned/elapsed. **Complexity: Low.** |
| `TRANSCRIPT` (active right-pane chat) | `getActiveSession(sessionId)` | ⚡ new service needed (spec callout) | Returns full message list (from "guest" / "ai" / "human"), translation metadata, tasks-created summary footer. **Complexity: Med** — needs translation lookup. |
| `SAFETY` (3 rows) | `listGuestSafetyEvents({ since: "-24h" })` | ⚡ new at `src/features/security/services.ts` | Token reuse, WiFi reveal, lock attempts. Sources: audit log + smart-lock provider webhooks. **Complexity: Med.** |
| 5-up KPIs (Active / Messages today / Auto-resolved % / Handoffs / CSAT) | `getConciergeKpis({ period })` | ⚡ new service needed | Aggregation; CSAT needs a feedback-collection mechanism that may not exist yet. **Complexity: Med-High.** |
| Memory editor block (4 hard-coded facts) | `listAcrossStayMemories({ ownerScope })` | ⚡ new service needed | Allergies, preferences, child-safety flags. **Complexity: Low** — JSON column on owner/guest, simple read. |

**Sprint estimate:** 2 days. Heaviest cabinet — the live transcript +
multilingual translation are non-trivial. CSAT needs a product
decision before wiring.

## Cabinet 3 — Finance

**File:** `src/app/(dashboard)/dashboard/finance/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `STMT_LINES` (17 rows — Emma Whitmore EV-07 March 2026) | `getStatementDetail(statementId)` | ⚡ new at `src/features/finance/services.ts` (spec callout) | Returns ledger lines grouped by section (revenue / fees / taxes / expenses / shared / mgmt / reserves). Each line has the line label, hint, and signed amount. **Complexity: Med** — schema for statement lines + section enum needed if absent. |
| `STMT_LIST` (5 statements for March 2026) | `listStatementsForPeriod(period)` | ⚡ new service needed | Returns one row per (owner × villa × period) with status (draft/approved/settled), net, sent date. **Complexity: Low** once the statement table exists. |
| `PAYMENTS` (5 payouts queued + settled) | `listPayoutsForCurrentOrg({ since })` | ⚡ new service needed | Source: payouts table + provider webhook state. **Complexity: Low.** |
| `TRANSPARENCY_ROWS` (5 bookings with collapsed 14-more tail) | `listStatementBookings(statementId)` | ⚡ new service needed | Per-line drill-down from the statement to the bookings + channel + payment. Hash-linked. **Complexity: Med** — requires the statement-line → bookings join table. |
| `WATERFALL` (8-row distribution percentages) | `getDistributionWaterfall({ period })` | ⚡ new service needed | Aggregation over `STMT_LINES` totals normalised to gross. Can be derived client-side from getStatementDetail. **Complexity: Low.** |
| 5-up KPIs (Gross / Fees / Taxes / Opex / Net) | Computed from `getStatementDetail()` | ✅ derivable | No new service needed — sum sections client-side. |
| Material-usage bridge footer (8 entries) | `getMaterialUsageBridgePending()` | ⚡ new service needed | Inventory consumption staged for next bridge run. **Complexity: Med** — touches inventory + finance bridge table. |

**Sprint estimate:** 2-3 days. This is the load-bearing cabinet for
owner trust — schema + service work is substantial.

## Cabinet 4 — Operations — ✅ DONE (TASK-6-DATA-PART-1)

**File:** `src/app/(dashboard)/dashboard/operations/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `HOUSEKEEPING` (3 rows) | `listHousekeepingForToday()` | ✅ exists at `src/features/operations/services.ts` (some shape) | Existing service returns broader housekeeping ops; reduce to today's 3-active. **Complexity: Low.** |
| `MAINTENANCE` (4 rows) | `listOpenMaintenance()` | ✅ exists | Filter to status ∈ {open, triaged, in_progress, waiting_parts}. Shape: villa/title/cat/pri/status/ago/who/sla. **Complexity: Low.** |
| `PREVENTIVE` (3 rows) | `listPreventiveUpcoming({ days: 30 })` | ✅ exists at `src/features/maintenance-intelligence/services.ts` | Already shaped. **Complexity: Low.** |
| `SERVICE_REQUESTS` (6 rows) | `listServiceRequests({ status })` | ✅ exists at `src/features/guest-services/services.ts` | Shape match: code/villa/guest/request/service/vendor/state. **Complexity: Low.** |
| AI Copilot band (ES-S5 3-hour gap narrative) | `getOperationsCopilotRun()` | ⚡ new — AI agent surface | Returns latest agent suggestion + reasoning + apply-action. **Complexity: High** (AI infra). |
| 6-up KPIs (Turnovers / Arrivals / Tickets / Preventive / Service / Photos) | `getOperationsKpis()` | ⚡ new service needed | Aggregation. **Complexity: Low-Med.** |
| Status board (8 status tiles) | `getStatusBoard()` | ⚡ new service needed | Per-villa current state rollup. **Complexity: Med** — joins bookings + owner-stays + maintenance OOO. |

**Sprint estimate:** 1.5 days (excluding the AI Copilot band which is
its own multi-day workstream).

## Cabinet 5 — AI Hub

**File:** `src/app/(dashboard)/dashboard/ai/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `AI_AGENTS` (8 cards) | `listAgents()` | ⚡ new at `src/features/ai/services.ts` — or reuse `src/lib/mock/ai-assistants.ts` | The mock module already has the right shape. Decision: keep mock until per-tenant agent enablement ships, then wire to a `agent_registry` table. **Complexity: Low** (mock → service swap) or **Med** (real registry). |
| `AI_INBOX` (5 messages) | `listAiInbox({ read })` | ⚡ new service needed | Cross-agent runs that produced human-visible output. **Complexity: Med.** |
| `RUNS` (6 audit-log rows) | `listRecentRuns({ limit, filter })` | ⚡ new service needed | Full audit-log read from `ai_runs` table. **Complexity: Low** — table likely exists for compliance. |
| Refusal footer note (`run-9aa` blocked) | Derived from `listRecentRuns()` | ✅ derivable | Filter by status=blocked, show 1 row. |
| 5-up KPIs (Agents live / Runs 30d / Avg latency / Token spend / Refusals) | `getAiHubKpis({ period })` | ⚡ new service needed | Aggregation over `ai_runs`. **Complexity: Low-Med.** |

**Sprint estimate:** 1 day once the `ai_runs` table is confirmed
authoritative. If not, schema work first.

## Cross-cabinet rollup

| Cabinet | Status | Notes |
|---|---|---|
| Overview | ✅ TASK-6-DATA-PART-1 | live · 7 readers in `dashboard-cabinet-queries.ts` |
| Bookings | ✅ TASK-6-DATA-PART-1 | live · 6 readers in `bookings-cabinet-queries.ts` (rate plans + sync deferred) |
| Operations | ✅ TASK-6-DATA-PART-1 | live · 6 readers in `operations-cabinet-queries.ts` (housekeeping + service requests empty) |
| Concierge | pending | most green-field; postpone until WhatsApp adapter is settled |
| Finance | pending | schema-heavy; statement engine in STATEMENT-1 sprint |
| AI Hub | pending | service work shares schema with future AI surfaces |
| **Total Mgmt** | **3 ✅ / 5 cabinets** | concierge + finance deferred to PART-1B/2 |

## Recommended TASK-6-DATA prompt sequence

Operator can sprint these one cabinet at a time. Recommended order:

1. **Operations** — smallest delta, services mostly exist.
2. **AI Hub** — service work shares schema with future AI surfaces.
3. **Bookings** — calendar strip is the riskiest piece, isolate it.
4. **Finance** — schema-heavy, do after Bookings to learn the pattern.
5. **Concierge** — most green-field; postpone until WhatsApp adapter
   is settled.

## Dev OS cabinets (TASK-7-DATA)

7 cabinets ported in this sprint. Same `// TODO(task-7-data):` marker
convention. Naming kept distinct so `git grep "task-6-data"` vs
`task-7-data` triages quickly.

### Cabinet 7.1 — Dev Overview / Command Center — 🟡 PARTIAL (TASK-7-DATA-PART-2)

**File:** `src/app/(development-app)/development-os/page.tsx`

| Mock array | Target | Service | Status |
|---|---|---|---|
| `PROJECTS` (3 rows) | `getActiveProjectsRollup()` | ✅ shipped in `dev-overview-queries.ts` | Live · projects + villa count, org-scoped |
| `STAFF` (8 cards) | `getTeamRoster()` | ✅ shipped | Live · org's active `app_users` + primary role |
| qs-cost-analyst AI band copy | `getLatestQsAnomaly()` | ✅ shipped | Live · last `agent_outputs` run, or friendly empty state |
| `RISK_RADAR` (4 rows) | `listRiskRadar()` | ⚡ deferred | Cross-project risk model · no schema yet → empty state copy |
| `SITE_ACTIVITY` (4 rows for today) | `listSiteActivityToday()` | ⚡ deferred | DEMO-1 didn't seed site_reports → empty state copy |
| 5-up KPIs | `getDevPortfolioKpis()` | ⚡ deferred | Active project count + total villas wired; commitment/progress/variance/IRR show "—" |

**Deferred to TASK-7-DATA-PART-3:** Risk radar service · site activity feed · cross-project KPI rollup (commitment / weighted progress / cost variance / portfolio IRR).

### Cabinet 7.2 — Project Manager — 🟡 PARTIAL (TASK-7-DATA-PART-2)

**File:** `src/app/(development-app)/development-os/cabinets/project-manager/page.tsx`

| Mock array | Target | Service | Status |
|---|---|---|---|
| `KANBAN` (4 columns) | `listWorkPackagesByStatus()` | ✅ shipped in `project-manager-cabinet-queries.ts` | Live · `work_packages` grouped by status, org-scoped |
| `AT_RISK` (3 rows) | `listAtRiskPackages(5)` | ✅ shipped | Live · WPs with `planned_finish < CURRENT_DATE` |
| Daily digest body | `getLatestDailyDigest()` | ✅ shipped | Live · latest `agent_outputs` daily_digest run, or empty state |
| `SCHEDULE_BARS` (6 bars · weekly gantt) | `getConstructionScheduleStrip()` | ⚡ deferred | No `schedule_tasks` schema yet → block removed from page |
| 5-up KPIs | `getPmKpis()` | ⚡ deferred | In-progress + overdue counts wired; variance/decisions/crew show "—" |

**Empty-state UX:** DEMO-1 didn't seed `work_packages` or daily-digest runs → kanban shows "Empty" per column with neutral copy; at-risk shows friendly "no overdue WPs" message; digest panel shows "NO DIGEST YET" placeholder. Schedule strip block dropped this sprint.

**Deferred to TASK-7-DATA-PART-3:** construction schedule strip (requires `schedule_tasks` schema) · schedule variance KPI · decisions-awaiting-me feed · crew-on-site rollup (depends on site_reports).

### Cabinet 7.3 — CFO / Accountant — ✅ DONE (TASK-7-DATA-PART-1)

**File:** `src/app/(development-app)/development-os/cabinets/cfo-accountant/page.tsx`

⚠️ **Bookkeeper widgets protection** — the snap-receipt /
SpreadsheetView quick-entry / transactions-with-delete widgets live on
**separate routes** under `/development-os/finance/transactions/*`.
This cabinet only links to them via three CTAs in the
SectionHeading.actions slot. **Do not move those widgets into this
file** without explicit operator decision; the existing routes ship
HF-7/HF-8/AI-ACTIVATION-1 fixes.

| Mock array | Target | Service | Status |
|---|---|---|---|
| `KPIS` (cash · AR · AP · spend · burn) | `getCfoKpis()` | ✅ shipped in `cfo-cabinet-queries.ts` | Live |
| `PNL_ROWS` (per project · 4 cols) | `getPnlByProject()` | ✅ shipped | Live · groups dev_transactions by project_id + cost_category type |
| `CASH_BARS` (8 weeks net) | `getCashStrip6Week()` | ✅ shipped | Live · trailing 8 weeks of inflow−outflow |
| `TAX_TYPES` (active list) | `getActiveTaxTypes()` | ✅ shipped | Live · `tax_types WHERE is_active AND not expired` |
| `SHARED_COSTS` (overhead categories) | `getSharedCostsBreakdown()` | ✅ shipped | Live · `cost_categories WHERE category_type = 'corporate_event'` |

**Empty-state UX:** KPIs show "—" when no snapshot. P&L / cash-strip /
tax / shared cost tables collapse to a single empty-state row instead
of alarming zeros.

**Deferred to TASK-7-DATA-PART-2:**
- Real cash *forecast* (currently trailing actuals only).
- Allocation rule engine for shared costs (currently shows "pending
  rule engine" + "—" per project).
- Tax MTD / YTD columns + status badges per filing.

### Cabinet 7.4 — QS / Cost Analyst (BOQ Desk) — ✅ DONE (TASK-7-DATA-PART-2)

**File:** `src/app/(development-app)/development-os/cabinets/qs/page.tsx`

| Mock array | Target | Service | Status |
|---|---|---|---|
| `BOQ` (top-7 lines) | `getBoqTopLines(7)` | ✅ shipped in `qs-cabinet-queries.ts` | Live · top-N `boq_items` ORDER BY total_minor DESC |
| `WP_STATS` (6-up strip) | `getBoqWpRollup()` | ✅ shipped | Live · top-level `boq_sections` w/ baseline (sum of item totals) |
| `RFQ_MATRIX` (4 vendors) | `getRfqMatrix()` | ✅ shipped | Live · active `procurement_quotations` + vendor + PR joins |
| AI anomaly band | Empty state until `agent_outputs` seeded | 🟡 deferred to PART-3 | Renders "No anomalies detected" + "Configure agent" CTA |

**Empty-state UX:** Each block collapses to italic friendly copy when its source table is empty for the org. "Filter / full BOQ" CTA preserved from TASK-7-VISUAL — links to the existing paginated `/development-os/boq` route.

### Cabinet 7.5 — Procurement Manager — ✅ DONE (TASK-7-DATA-PART-1)

**File:** `src/app/(development-app)/development-os/cabinets/procurement-manager/page.tsx`

| Mock array | Target | Service | Status |
|---|---|---|---|
| `OPEN_PRS` | `listOpenPurchaseRequests()` | ✅ shipped in `procurement-cabinet-queries.ts` | Live · `dev_os_purchase_requests` org-scoped |
| `POS_IN_TRANSIT` | `listPosInTransit()` | ✅ shipped | Live · `material_purchase_orders` org-scoped |
| `INVOICES` | `listInvoicesAwaitingApproval()` | ✅ shipped | Live · `dev_invoices WHERE invoice_type = 'payable'` org-scoped |
| 5-up KPIs | derived from above | ✅ inline | Live · computed from PR + PO + invoice arrays |

**Empty-state UX:** DEMO-1 didn't seed procurement data → all three
queries return [] for the Arconique org. Cabinet renders friendly
empty-state cards with "Create first PR →" CTA on the PRs section,
and explanatory hints on the others. KPI strip shows "—" instead of
alarming "0".

**Deferred to TASK-7-DATA-PART-2:**
- Active RFQs KPI (quotation flow).
- Avg PR → PO cycle-time KPI (analytics aggregation).
- DEMO-2 seed for procurement data once schedule allows.

### Cabinet 7.6 — Site Supervisor — 🟡 PARTIAL (TASK-7-DATA-PART-2)

**File:** `src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx`

| Mock array | Target | Service | Status |
|---|---|---|---|
| `DIARY` (5 timeline rows) | `listRecentSiteReports(5)` | ✅ shipped in `site-supervisor-cabinet-queries.ts` | Live · `site_reports` JOIN projects + reporter, org-scoped |
| `PHOTOS` (10 thumbs) | `listRecentSitePhotos(10)` | ✅ shipped | Live · `site_report_photos` JOIN reports + projects, org-scoped |
| Voice-note transcribed panel | `getLatestVoiceNote()` | ⚡ deferred | No `voice_notes` schema yet → placeholder copy |
| 5-up KPIs | `getSiteSupervisorKpis()` | 🟡 partial | Reports/today + photos/today wired from live arrays; QA + safety + activities show "—" |

**Empty-state UX:** DEMO-1 didn't seed `site_reports`/`site_report_photos` → timeline collapses to "No site reports filed yet"; photo grid collapses to neutral copy. KPI strip shows "—" instead of zeros where empty. Voice-note panel kept as dashed-border placeholder mentioning DEMO-2 dependency.

**Deferred to TASK-7-DATA-PART-3:** `voice_notes` schema + transcription queue · `qa_qc_issues` rollup for "QA checks done" KPI · `safety_incidents` schema for safety streak.

### Cabinet 7.7 — AI Agents — ✅ DONE (TASK-7-DATA-PART-2)

**File:** `src/app/(development-app)/development-os/ai-agents/page.tsx`

| Mock array | Target | Service | Status |
|---|---|---|---|
| `AGENTS` (10 cards) | `getDevAgentConfigs()` | ✅ shipped in `ai-agents-cabinet-queries.ts` | Live · `org_ai_agent_config` over canonical agent_key set; missing rows render as "Not configured" |
| `INBOX` (5 rows) | `getRecentAgentOutputs(8)` | ✅ shipped | Live · `agent_outputs` filtered by dev-side agent_key set |
| 5-up KPIs | `getDevAiKpis({ period: "30d" })` | 🟡 partial | Live count + inbox count wired; runs/latency/tokens show "—" |

**Empty-state UX:** Cards always render (canonical 9-agent set); enabled agents show "LIVE" badge, configured but disabled show "PAUSED", missing config rows show "Not configured". Inbox table collapses to friendly empty-state copy when no `agent_outputs` rows exist.

**Deferred to TASK-7-DATA-PART-3:** Runs / avg-latency / token-spend KPI aggregations (depend on telemetry table).

## Dev rollup

| Cabinet | New services | Existing services | Sprint | Status |
|---|---|---|---|---|
| Dev Overview | 4 | 2 | 1 day | 🟡 PART-2 (projects+team+AI band live · risk/activity/KPI-rollup → PART-3) |
| Project Manager | 5 | 0 | 1.5 days | 🟡 PART-2 (kanban+at-risk+digest live · schedule strip → PART-3) |
| CFO / Accountant | 3 | 3 | 1 day | ✅ TASK-7-DATA-PART-1 |
| QS / BOQ Desk | 3 | 1 | 1 day | ✅ TASK-7-DATA-PART-2 |
| Procurement Mgr | 1 | 3 | 0.5 day | ✅ TASK-7-DATA-PART-1 |
| Site Supervisor | 3 | 1 | 1.5 days | 🟡 PART-2 (reports+photos live · voice-note/QA/safety → PART-3) |
| AI Agents | 3 | 0 | 1 day | ✅ TASK-7-DATA-PART-2 |
| **Total** | **22** | **10** | **~7.5 days** | **4 ✅ · 3 🟡 / 7 cabinets** |

## Combined rollup (Tasks 6 + 7 data wiring)

| Sprint | New services | Existing | Days |
|---|---|---|---|
| Task-6-DATA (5 Mgmt) | 24 | 7 | ~8 |
| Task-7-DATA (7 Dev) | 22 | 10 | ~7.5 |
| **Total** | **46** | **17** | **~15.5 senior-eng days** |

## Recommended TASK-7-DATA prompt sequence

1. **Procurement Manager** — smallest delta, almost everything exists.
2. **CFO / Accountant** — mostly existing services; ⚠️ preserve the
   `/finance/transactions/*` bookkeeper routes intact (HF-7/HF-8/
   AI-ACTIVATION-1 fixes live there, not in the cabinet page).
3. **QS / BOQ Desk** — leverages existing BOQ + RFQ services.
4. **Dev Overview** — risk radar + activity rollups.
5. **AI Agents** — schema decisions on `ai_runs` + agent registry.
6. **Project Manager** — kanban + schedule strip schema-heavy.
7. **Site Supervisor** — transcription + photo geo-tag pipeline.

## Hard constraints carried from TASK-6-VISUAL + TASK-7-VISUAL

- `// TODO(task-6-data):` / `// TODO(task-7-data):` comments mark every
  replacement site. When wiring, search the file for that marker and
  ensure 0 remain after the swap.
- HF-12 RSC pattern: never pass a forwardRef component (lucide) across
  a server→client prop. Use the existing `DashboardIcon` registry if
  icons need to flow through service results.
- Task 5 shell wraps every cabinet; don't bypass it.
- ARCH-1 cookie SSO and HF-13 routing untouched.
- **CFO bookkeeper widgets** (snap-receipt OCR · SpreadsheetView
  quick-entry · transactions list with delete) live on dedicated
  routes under `/development-os/finance/transactions/*` — do NOT move
  them into the cabinet page without explicit operator decision.
  Existing HF-7/HF-8/HF-9/HF-11/AI-ACTIVATION-1 fixes are anchored to
  those routes.
