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
