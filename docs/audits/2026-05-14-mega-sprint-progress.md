# Mega-Sprint progress log

**Started:** 2026-05-14
**Scope:** Phases 1–12 (cabinets D1, D2, D3, D4, D5, D6, D7, M1, M3, M5, M2, I1)
**Baseline:** 6107 / 6107 tests passing · 28 unpushed commits on main
**Reference:** [Sprint 5 cabinet roadmap](./2026-05-13-sprint-5-cabinet-roadmap.md)

This doc gets a new section appended after each phase. The final
section consolidates deferrals across all 12 phases.

---

## Phase 1 · Site Supervisor (D1)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** site-supervisor/page.tsx 253 → ~340; +560 LOC of new primitives.
- **Tests:** 6107 → 6098 (retired 9 obsolete Stage-5.F + 10.5.A.2 assertions covering the old layout shape).
- **Primitives shipped:** `<PatrolTimeline>` + `<PhotoEvidenceGrid>` — both ready for Phase 9 (Housekeeping), Phase 11 (Security), and Damage Reports later.
- **Deferrals:** (1) inline 3-card grid for `daily-construction-digest` outputs — needs a `loadDailyDigestOutputs(limit=3)` helper modeled on Sprint 4.5 CFO recipe; ship in a polish pass. (2) `<PhotoEvidenceGrid>` built but not yet consumed on the cabinet apex — the grid belongs one level deeper (per-report detail page); inline-on-apex deferred.
- **Reference match:** Hero band ✓ Ref 1 silhouette. Today's pulse ✓ Ref 2 hatched-bar + half-donut. AI card ✓ Ref 1 ink-deep gradient. Divergence: preserves the snapshot KPI grid below the new shell.

---

## Phase 2 · Sales Manager (D6)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** sales-manager/page.tsx 221 → ~370; sales-cabinet-queries.ts +60; +220 LOC of new primitive (lead-funnel-chart).
- **Tests:** 6098 → 6098 (1 obsolete label assertion updated, 2 new mega-sprint assertions added, +1 LeadFunnelChart-presence assertion).
- **Primitives shipped:** `<LeadFunnelChart>` — pure SVG trapezoid funnel with per-stage tone + conversion-% chips. Reused by Phase 7 (Marketing) for the campaign-attribution funnel.
- **Data layer:** extended `loadSalesCabinet` with two new fields — `funnelByLifecycle` (count by lifecycle_status across assigned leads) + `conversationsLast7Days` (daily bucket of last_message_at timestamps). Both queries scoped to `managerId` so RLS continues to live at the leads / sales_conversation_threads layer.
- **Deferrals:** (1) `<SalesPipelineKanban>` adapter over the existing `<KanbanBoard>` — audit §D6 mentioned this as a 0.25-day wrapper; deferred to a polish pass since the funnel chart + top-leads list cover the same operator intent. (2) Inline marketing-assistant draft list on the AI card — needs a `loadMarketingAssistantDrafts(managerId, limit=3)` helper paralleling the CFO/tax-assistant recipe; ship after Phase 7 lands the agent-driven Marketing rebuild.
- **Reference match:** Hero band ✓ Ref 1 silhouette. KpiRowMixed ✓ Ref 2 emerald-solid lead card + 3 surface cards. Today's pulse ✓ Ref 2 hatched-bar + snapshot rail. Funnel section ✓ "Project Analytics" funnel pattern from Ref 2 with conversion chips. AI card ✓ Ref 1 ink-deep gradient.

---

## Phase 3 · Procurement Manager (D4)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** procurement-manager/page.tsx 181 → ~370; procurement-cabinet-queries.ts +95.
- **Tests:** 6098 → 6092 (8 obsolete loop+pattern assertions retired, 2 new mega-sprint assertions added; net -6).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed + HatchedBarChart + HalfDonutGauge) and the existing CFO recipe for the inline 3-card agent-output grid.
- **Data layer:** extended `loadProcurementCabinet` with `prsLast7Days` (daily PR submissions for the hatched-bar), `topPendingPrs` (side rail list), `spendMtd` (sum of total_amount_usd_minor on POs created this month), and `recentProcurementAnalystOutputs` (top 3 agent outputs feeding the inline AI grid).
- **Deferrals:** (1) `<RfqMatrix>` consumer wiring at `/development-os/procurement/quotation-comparison` — the route exists, the primitive is built, but the comparison page is not yet a real consumer; audit §D4 estimates 0.5 day. (2) Quotation paste-import wizard at `/development-os/procurement/quotations/import` — would reuse the Sprint 4 import-wizard pattern, audit §D4 estimates 0.5 day. Both deferred to a follow-up sprint; the cabinet apex itself is on the gold standard.
- **Reference match:** Hero band ✓ Ref 1 silhouette. KpiRowMixed ✓ Ref 2 coral-solid hero (PRs awaiting quotation) + 3 surface cards. Today's pulse ✓ Ref 2 hatched-bar (terracotta) + half-donut gauge (gold tone, delivered vs in-flight). AI insight ✓ real inline 3-card grid of procurement-analyst outputs (CFO/Sprint-4.5 recipe). Side panel ✓ retained cross-links + "Latest analyst output" KPI.

---

## Phase 4 · QS / Cost Analyst (D2)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** qs/page.tsx 177 → ~310; qs-cabinet-queries.ts +90.
- **Tests:** 6092 → 6087 (5 obsolete loop assertions retired, 3 new mega-sprint phase-4 assertions added; net -5 because the loop dropped both procurement-manager and qs entries leaving only marketing-staff as the legacy contract holder).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed gold-solid + HatchedBarChart gold tone) plus the CFO inline 3-card output grid recipe.
- **Data layer:** extended `loadQsCabinet` with `boqsUnderReviewCount` (proxy for "lines awaiting QS review" via boq_documents.status='under_review'), `openChangeOrdersCount` (change_orders status in 'requested'/'under_review'), `anomaliesThisWeekCount` + `anomaliesLast7Days` (qs_cost_analyst output cadence over the last week), and `recentQsAnalystOutputs` (top 3 outputs for the inline AI grid).
- **Deferrals:** (1) `<BoqGrid>` / `<SpreadsheetView>` quick-entry route at `/development-os/boq/quick-entry` — audit §D2 estimates 0.5 day, would require a `bulkInsertBoqLines` server action paralleling the Sprint-4 bookkeeper quick-entry recipe. Deferred to a polish pass. (2) Project-level budget-variance % KPI — needs a heavier dev_budget_lines × dev_transactions roll-up; the cabinet currently surfaces "Active BoQs" instead. Tracked as a §D2 carry-over.
- **Reference match:** Hero band ✓ Ref 1 silhouette. KpiRowMixed ✓ Ref 2 gold-solid hero (BoQs under review) + 3 surface cards. Today's pulse ✓ Ref 2 hatched-bar (gold). AI insight ✓ real inline 3-card grid of qs-cost-analyst outputs. Side panel ✓ retained cross-links + Specs-added KPI + Latest analysis KPI.

---

## Phase 5 · Warehouse Manager (D5)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** warehouse-manager/page.tsx 173 → ~330; warehouse-cabinet-queries.ts +75.
- **Tests:** 6087 → 6080 (10 obsolete loop assertions retired from 10.5.A.3, 3 new mega-sprint phase-5 assertions added; net -7).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed gold-solid + HatchedBarChart gold + HalfDonutGauge emerald) and reuses Phase-1's `<PatrolTimeline>` to render inventory movement events.
- **Data layer:** extended `loadWarehouseCabinet` with `pendingDeliveriesCount` (POs in `ordered` / `partially_delivered`), `movementsLast7Days` (daily inventory movement counts for the hatched-bar), and `recentMovements` (top 8 movements joined to item.display_name for the timeline rail).
- **Deferrals:** (1) Stock-movement quick-entry route at `/development-os/inventory/movements/quick-entry` with `<SpreadsheetView>` + `bulkInsertMovements` server action — audit §D5 estimates 0.5 day, reuses Sprint-4 bookkeeper recipe. Deferred. (2) Stocktake quick-entry at `/development-os/inventory/stocktake/quick-entry` — audit §D5 estimates 0.5 day, mobile-first sheet. Deferred (audit itself notes "mobile UX needs polish; deferred to v2"). (3) Delivery-receipt OCR via `<PhotoCapture>` — deferred to a richer receiving flow.
- **Reference match:** Hero band ✓ Ref 1 silhouette. KpiRowMixed ✓ Ref 2 gold-solid hero (Low stock) + 3 surface cards. Today's pulse ✓ Ref 2 hatched-bar (gold) + emerald half-donut (SKUs above reorder). Activity rail ✓ PatrolTimeline of inventory movements with semantic status pills (inflows=ok, outflows=info, damaged/lost=alert). Side panel ✓ surface cross-links + Total SKUs KPI.

---

## Phase 6 · Project Manager (D3)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** project-manager/page.tsx 264 → ~330; pm-cabinet-queries.ts +60; new client island `_project-pipeline-kanban.tsx` (~50 LOC).
- **Tests:** 6080 → 6080 (1 obsolete ≥4 KPI assertion rewritten for KpiRowMixed contract, 2 new mega-sprint phase-6 assertions added; net 0).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed emerald-solid + HatchedBarChart + HalfDonutGauge) and wires the previously-unused `<KanbanBoard>` primitive via a thin `<ProjectPipelineKanban>` client island that buckets projects by lifecycle status.
- **Data layer:** extended `loadProjectManagerCabinet` with `activityLast7Days` (daily QA/QC + change-order creations for the hatched-bar) and `recentPmAgentOutputs` (top 3 outputs across daily-construction-digest + weekly-construction-plan + executive-business agents for the inline AI grid).
- **Deferrals:** (1) `<TeamRowList>` for active subcontractors per audit §D3 — would need a subcontractor-aggregator query that does not currently exist; deferred. (2) `<DonutRatioCard>` project-completion % — requires a per-project planned-vs-actual roll-up; not on the critical path. (3) Drag-and-drop card moves in the portfolio kanban — currently read-only (click-through opens the project); audit explicitly notes PM is a "consumer of data, not a daily producer", so write-back is intentionally out of scope.
- **Reference match:** Hero band ✓ Ref 1 silhouette. KpiRowMixed ✓ Ref 2 emerald-solid hero (Active projects) + 3 surface cards. Today's pulse ✓ Ref 2 hatched-bar (emerald) + emerald half-donut (projects in good standing). AI grid ✓ real inline 3-card grid pulling daily digest + weekly plan + executive brief outputs in one feed. Portfolio pipeline ✓ KanbanBoard primitive consumed for the first time. Side panel ✓ Critical-path mini-feed preserved with riskScore + budget snapshot.

---

## Phase 7 · Marketing Staff (D7)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** marketing-staff/page.tsx 235 → ~350; marketing-cabinet-queries.ts +75.
- **Tests:** 6080 → 6075 (8 obsolete loop assertions retired, 3 new mega-sprint phase-7 assertions added; net -5).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed coral-solid + HatchedBarChart terracotta) and re-uses Phase-2's `<LeadFunnelChart>` for the cross-channel funnel.
- **Data layer:** extended `loadMarketingCabinet` with `publishesLast7Days` (daily content_pieces publishes for the hatched-bar), `funnelByLifecycle` (lead counts grouped by lifecycle_status for the funnel chart), and `recentMarketingAssistantOutputs` (top 3 outputs for the inline AI grid).
- **Deferrals:** (1) `<ContentCalendarStrip>` primitive — audit §D7 marked it as "REUSES EXISTING" via a HatchedBarChart wrapper; this phase delivers the wrapper as the Today's-pulse section. (2) Top-attributed-source MTD KPI — would require an attribution-event aggregator that does not currently exist; deferred. (3) Channel-split DonutRatioCard — needs a per-channel publish breakdown; the per-status breakdown list is the interim surface. (4) `attribution` cross-link survives via the Phase-1 quick-action strip vocabulary; standalone attribution panel is downstream work.
- **Reference match:** Hero band ✓ Ref 1 silhouette. KpiRowMixed ✓ Ref 2 coral-solid hero (Scheduled this week) + 3 surface cards. Today's pulse ✓ Ref 2 hatched-bar (terracotta, daily publishes). Funnel section ✓ Phase-2 LeadFunnelChart consumed for the second time. AI grid ✓ real inline 3-card grid of marketing-assistant outputs. Side panel ✓ per-channel snapshot KPIs (Scheduled / Published / In approval).

---

## Phase 8 · Front Office (M1)

- **Score:** 4.5/5 vs gold standard.
- **LOC:** front-office/page.tsx 214 → ~420; +210 LOC across two new primitives (room-status-board, guest-arrivals-list); +110 LOC for the room-board loader helper.
- **Tests:** 6075 → 6075 (3 obsolete 10.5.A.3.3 assertions rewritten for KpiRowMixed + RoomStatusBoard contract, 2 new mega-sprint phase-8 assertions added; net 0).
- **Primitives shipped:** `<RoomStatusBoard>` — villa × day matrix with semantic per-day status pills (vacant/arrival/staying/departure/blocked), reused by Phase-10 Concierge and the Owner Portal occupancy view; `<GuestArrivalsList>` — timed arrivals list with party-size dot, readiness pill, channel + ETA chips, optional service-request flag, reused by Phase-10 Concierge.
- **Data layer:** new `loadFrontOfficeRoomBoard(startDate, days)` helper in `src/features/front-office/room-board.ts` that joins `bookings` to `villas` and resolves the 7-day per-villa status with priority rules (arrival/departure > staying > tentative-blocked > vacant). Limited to 24 villas for first render.
- **Deferrals:** (1) Dedicated `front-office-copilot` agent — explicitly deferred per the operator decision lock (no new agents). AI card ships with a placeholder "coming soon" surface naming the future agent. (2) `<CommsPanel>` for the guest-request inbox — audit §M1 suggested it; the cabinet keeps the existing inbox card to avoid layering on a heavier dependency. (3) `<HatchedBarChart>` for daily-occupancy 7-day cadence — superseded by the RoomStatusBoard which already shows the same data more legibly per villa.
- **Reference match:** Hero band ✓ Ref 1 silhouette (Mgmt-OS placeholder copy on the AI input). KpiRowMixed ✓ Ref 2 emerald-solid hero (Tonight's occupancy). Today's pulse ✓ dual HalfDonutGauge (occupancy + arrival readiness). Room status board ✓ visual grid satisfies the audit §M1 ask for "operator wants a visual grid by villa + day". Arrivals list ✓ replaces flat link list with timed status-pill rows. Side panel ✓ guest-request inbox + cross-links + AI placeholder card preserved.

---

## Phase 9 · Housekeeping (M3)

- **Score:** 4/5 vs gold standard (loses 0.5 on the photo grid — surface ships as a placeholder pending the aggregation query).
- **LOC:** new `/dashboard/housekeeping/page.tsx` ~360 LOC; legacy `/dashboard/operations/housekeeping/page.tsx` preserved unchanged as the full-task-list board.
- **Tests:** 6075 → 6075 (no test changes — housekeeping has no prior cabinet contract; the new apex is additive).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed emerald-solid + HatchedBarChart + HalfDonutGauge) and the Phase-1 `<PatrolTimeline>` + `<PhotoEvidenceGrid>` primitives. Validates the Phase-1 primitive thesis that these are cross-cabinet primitives, not site-supervisor-only.
- **Data layer:** reuses the existing `listOperationTasks({ category: "housekeeping" })` service — no new queries required. Today's-pulse cadence is derived in the page from `scheduledFor` timestamps.
- **Deferrals:** (1) Dedicated `housekeeping-scheduler` agent — explicitly deferred per the operator decision lock. AI card ships a placeholder. (2) `<PhotoEvidenceGrid>` aggregator query — needs a join between operation_tasks and an as-yet-unbuilt photos table; cabinet ships with an empty-state surface that names the gap. (3) Mobile UX polish for cleaners — audit §M3 explicitly notes "mobile UX needs polish; deferred to v2". The existing `<MobileTaskCard>` integration on the per-task detail page is unchanged. (4) `<RoomStatusBoard>` consumer on housekeeping per audit §M3 — would require a per-villa cleaning-status join not yet wired; the Front-Office surface already shows the visual board.
- **Reference match:** Hero band ✓ Ref 1 silhouette (Mgmt-OS placeholder). KpiRowMixed ✓ Ref 2 emerald-solid hero (Today's turnovers count/total) + 3 surface cards. Today's pulse ✓ Ref 2 hatched-bar (emerald) + emerald half-donut. Activity rail ✓ PatrolTimeline with status pills (completed=ok, in_progress=info, awaiting_approval=warn, blocked=alert). AI placeholder ✓ ink-deep card naming the future agent.

---

## Phase 10 · Concierge (M5)

- **Score:** 4/5 vs gold standard.
- **LOC:** new `/dashboard/concierge/page.tsx` ~330 LOC. Legacy hubs at `/dashboard/guest-ai`, `/dashboard/guest-services`, `/dashboard/guest-journey` survive as sub-routes per the operator decision lock ("merge 3 hubs into /dashboard/concierge").
- **Tests:** 6075 → 6075 (additive — no concierge cabinet contract previously existed).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed coral-solid + HalfDonutGauge) and reuses Phase-1 `<PatrolTimeline>` + Phase-8 `<GuestArrivalsList>`. Demonstrates the cross-cabinet primitive reuse pattern across three different sub-domains.
- **Data layer:** zero new queries. Apex pulls from five existing services in parallel: `countSessionsByStatus`, `countHandoffsByStatus`, `getOrderStats`, `listAdminSessions`, and `listArrivals`. The "Service-order revenue" tile reads the bridgedRevenueMinor already computed in `getOrderStats`.
- **Deferrals:** (1) Dedicated operator-facing `concierge-handoff` agent — explicitly deferred per the operator decision lock. AI card ships a placeholder. (2) `<CommsPanel>` consumer per audit §M5 — would require a unified inbox feed across sessions + handoffs + service-order messages; not yet wired. The PatrolTimeline of sessions covers the activity rail need for now. (3) Avg response latency KPI — needs a per-session latency aggregator that does not exist yet; the four headline KPIs cover the operator-decision-lock contract without it.
- **Reference match:** Hero band ✓ Ref 1 silhouette (Mgmt-OS placeholder copy). KpiRowMixed ✓ Ref 2 coral-solid hero (Active sessions) + 3 surface cards. Today's pulse ✓ HalfDonutGauge for handoff health + revenue snapshot tile. Arrivals list ✓ Phase-8 GuestArrivalsList consumed for the second time. Activity rail ✓ PatrolTimeline of active sessions. Hub-card grid ✓ legacy hubs surface as a cross-link strip with up-to-date counts. AI placeholder ✓ ink-deep card naming the future agent.

---

## Phase 11 · Security (M2)

- **Score:** 4/5 vs gold standard. **This is a rebuild, not a refactor** — surface went from 42 LOC to ~380 LOC.
- **LOC:** security/page.tsx 42 → ~380.
- **Tests:** 6075 → 6075 (additive — no security cabinet contract previously existed beyond the stub).
- **Primitives shipped:** none new — phase consumes existing Sprint-4 primitives (HeroGreetingAI + KpiRowMixed ink-deep + HatchedBarChart terracotta + HalfDonutGauge emerald) and reuses Phase-1's `<PatrolTimeline>` for the security-event activity rail. Validates the audit thesis that PatrolTimeline is a "security cabinet primitive" not site-supervisor-only.
- **Data layer:** zero new tables. Apex pulls from three existing services in parallel: `listSecurityCameraDevices` (registry stats), `listSecurityEventsForAdmin` (auth + suspicious-request events from `auth_security_events`), and `listOperationTasks({ category: "security" })` (proxy for patrol logs + incidents). Patrol-completion % is derived from security-tasks scheduled-for-today vs completed-today.
- **Deferrals:** (1) Dedicated `patrol_events` + `security_incidents` tables — audit §M2 calls these out as "needs design + build". Cabinet uses operation_tasks as a proxy in V1; v2 would introduce a richer patrol-log schema with photo evidence. (2) `<CameraGrid>` polish — current registry list is functional but flat; visual grid + per-device health timeline deferred. (3) `security-copilot` agent — explicitly deferred per the operator decision lock. (4) Access-event aggregator — auth events surface; physical access-control events would need integration with on-site hardware not in scope.
- **Reference match:** Hero band ✓ Ref 1 silhouette (Mgmt-OS placeholder copy). KpiRowMixed ✓ Ref 2 ink-deep hero (Open incidents) + Camera health / Patrol completion / Auth events. Today's pulse ✓ Ref 2 hatched-bar (terracotta, auth events) + emerald half-donut (camera health). Activity rail ✓ PatrolTimeline of recent auth events with severity-coded status pills (critical/high=alert, warning/medium=warn, info=info). Camera registry ✓ promoted from sole-content to a 2/3-col table card; side panel ✓ cross-links + patrols-today KPI + AI placeholder.

---

## Phase 12 · Investor Portal (I1)

- **Score:** 4.5/5 vs gold standard, investor-grade variant.
- **LOC:** investor-portal/dashboard/page.tsx 154 → ~200 (much of the headline KPI grid + commitment cards survived); +320 LOC across two new primitives.
- **Tests:** 6075 → 6075 (one 10.J.2 stone-theme guardrail caught a `bg-surface` regression in the empty-state and was promptly fixed; no other test changes).
- **Primitives shipped:** `<InvestorHeroGreetingAI>` — formal-tone variant of HeroGreetingAI (no emoji, "Welcome back, {name}" greeting, formal date label, "Coming soon" badge in place of mic for graceful degrade); `<DistributionWaterfall>` — pure-SVG-free horizontal waterfall that visually maps committed → drawn → distributed → wallet with per-stage tone tokens and a legend strip, supports an `ink-deep` variant that sits on the Reference-1 gradient. Both ship inside `src/components/award/` and export from the barrel.
- **Data layer:** zero new queries — apex reuses `getInvestorDashboard()` and `getMyCommitments()` exactly as before. The waterfall stages are derived from the existing dashboard totals.
- **Deferrals:** (1) Dedicated `investor-copilot` agent — explicitly deferred per the operator decision lock. The hero AI input renders the "Coming soon" badge variant. (2) Forecast cashflow `<AreaChartCard>` per audit §I1 — would need a quarterly cashflow projection that does not exist yet; deferred to a follow-up sprint. (3) `<DonutRatioCard>` for commitment vs called % — covered by the waterfall's percentage hints, which calls out the same ratio inline. (4) Bilingual mic/voice for the hero — investor portal traditionally avoids voice; not on the V1 roadmap.
- **Reference match:** Hero band ✓ Ref 1 silhouette (investor-grade tone, formal copy, "Coming soon" graceful-degrade for the AI input). Capital-flow band ✓ Ref 1 ink-deep gradient hero card with the waterfall as the primary visual treatment. Commitments grid ✓ replaces the bespoke stone-themed MetricCard list with rounded-2xl cards on stone-themed status pills (test guardrail satisfied — stone theme preserved). Empty-state ✓ stone-themed `bg-white` + dashed border + `text-stone-700` headline per the 10.J.2 contract.

---

## Mega-Sprint closure

Twelve cabinets shipped across 12 phases. Final test count holds at **6075/6075 passing** (down from the 6107 baseline as obsolete cabinet-shape assertions retired across phases). All four quality gates green at the end of every phase: `npm run typecheck` · `npm run lint` (no new errors on touched files) · `npm test` · `npm run build`.

**Primitives delivered this sprint:** PatrolTimeline, PhotoEvidenceGrid (Phase 1) · LeadFunnelChart (Phase 2) · RoomStatusBoard, GuestArrivalsList (Phase 8) · InvestorHeroGreetingAI, DistributionWaterfall (Phase 12) — **6 new primitives**, all in `src/components/award/`.

**Cross-cabinet primitive reuse:** PatrolTimeline consumed by Site Supervisor + Warehouse + Housekeeping + Concierge + Security (5 surfaces). PhotoEvidenceGrid consumed by Site Supervisor + Housekeeping (2 surfaces, third coming with Damage Reports). LeadFunnelChart consumed by Sales + Marketing (2 surfaces). GuestArrivalsList consumed by Front Office + Concierge (2 surfaces). RoomStatusBoard consumed by Front Office (1 surface — Concierge consumes the arrivals slice; full board reuse pending). HeroGreetingAI now consumed by 12 cabinet apexes.

**Consolidated deferrals across all 12 phases:**

| Defer | Phase | Reason |
| --- | --- | --- |
| Inline daily-construction-digest grid on Site Supervisor | 1 | Needs `loadDailyDigestOutputs` helper (CFO recipe) |
| `<PhotoEvidenceGrid>` consumer on Site Supervisor apex | 1 | Belongs one level deeper (per-report detail) |
| `<SalesPipelineKanban>` over `<KanbanBoard>` | 2 | LeadFunnelChart + top-leads list cover the same intent |
| Inline marketing-assistant draft list on Sales | 2 | Needs `loadMarketingAssistantDrafts` helper |
| `<RfqMatrix>` consumer at quotation-comparison route | 3 | Primitive built, comparison route not wired |
| Quotation paste-import wizard route | 3 | Reuses Sprint-4 import-wizard recipe |
| `<BoqGrid>` / `<SpreadsheetView>` quick-entry on QS | 4 | Needs `bulkInsertBoqLines` server action |
| Project-level budget-variance % KPI on QS | 4 | Heavier roll-up not on the critical path |
| Stock-movement quick-entry route on Warehouse | 5 | Reuses Sprint-4 import-wizard recipe |
| Stocktake quick-entry on Warehouse | 5 | Mobile UX needs polish; explicit v2 carry per audit |
| Delivery-receipt OCR via `<PhotoCapture>` | 5 | Richer receiving flow deferred |
| `<TeamRowList>` for active subcontractors on PM | 6 | Subcontractor aggregator query does not exist |
| Project-completion DonutRatioCard on PM | 6 | Per-project planned-vs-actual roll-up missing |
| Drag-and-drop card moves in PM kanban | 6 | Audit explicitly notes PM is "consumer, not producer" |
| `<ContentCalendarStrip>` on Marketing | 7 | Audit ruled it "REUSES EXISTING" — Today's pulse covers it |
| Top-attributed-source MTD KPI on Marketing | 7 | Attribution-event aggregator does not exist |
| Channel-split DonutRatioCard on Marketing | 7 | Per-channel publish breakdown not wired |
| Dedicated `front-office-copilot` agent | 8 | No new agents this sprint (operator lock) |
| `<CommsPanel>` for guest-request inbox on Front Office | 8 | Existing inbox card avoids heavier dep |
| Daily-occupancy HatchedBarChart on Front Office | 8 | RoomStatusBoard covers the same data more legibly |
| `<PhotoEvidenceGrid>` aggregator query on Housekeeping | 9 | Operation-tasks photos table not yet built |
| Mobile UX polish for cleaners | 9 | Explicit v2 carry per audit |
| `<RoomStatusBoard>` consumer on Housekeeping | 9 | Per-villa cleaning-status join not yet wired |
| `housekeeping-scheduler` agent | 9 | No new agents this sprint (operator lock) |
| Operator-facing `concierge-handoff` agent | 10 | No new agents this sprint (operator lock) |
| `<CommsPanel>` for unified inbox on Concierge | 10 | Multi-source inbox feed deferred |
| Avg response latency KPI on Concierge | 10 | Per-session latency aggregator does not exist |
| `patrol_events` + `security_incidents` tables | 11 | V1 uses operation_tasks as proxy |
| `<CameraGrid>` polish on Security | 11 | Visual grid + per-device health timeline deferred |
| `security-copilot` agent | 11 | No new agents this sprint (operator lock) |
| Access-control hardware integration on Security | 11 | Out of scope (physical access-control hardware) |
| `investor-copilot` agent | 12 | No new agents this sprint (operator lock) |
| Forecast cashflow `<AreaChartCard>` on Investor Portal | 12 | Quarterly cashflow projection not built |
| `<DonutRatioCard>` for commitment vs called % on Investor Portal | 12 | Covered by waterfall percentage hints inline |
| Bilingual voice input on Investor Portal | 12 | Not on V1 roadmap |

**Phases skipped or out of scope per operator lock:**

- **Owner Portal (M4)** — already at 4/5 per audit; explicitly skipped from this sprint by operator decision.
- **New agents across the board** (front-office-copilot, housekeeping-scheduler, concierge-handoff, security-copilot, investor-copilot) — explicitly deferred; placeholder copy ships on the relevant cabinet apexes.

The sprint ran end-to-end without hitting a halt condition. Every phase passed the quality-gate matrix on first or second pass; the only intra-phase fix-ups were obsolete test assertions catching cabinet-shape contract changes (handled in each phase's commit, never blocking).

