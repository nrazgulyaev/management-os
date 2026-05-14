# Cabinet Roadmap — Sprint 5 Audit

**Date:** 2026-05-14
**Mode:** Read-only — no code changes, no migrations, no new files except this audit.
**Author:** assistant
**Source surfaces inspected:** 13 candidate cabinets (7 Dev OS + 5 Mgmt OS + Investor Portal); existing primitives in `src/components/ui/primitives/` + `src/components/award/`; agent registry in `src/lib/development/server/ai/`.

---

## Executive summary

1. **Sprint 4 set a clear gold standard** at `/development-os/cabinets/cfo-accountant`. The next 12 cabinets fall into three rough tiers: 7 cabinets already on Stage-10.6.C.1 primitives (CabinetGreetingBlock + DashboardKpi); 4 cabinets still on Stage-6 baseline (MetricCard + PageHeader); 1 cabinet (Investor Portal) uses bespoke portal-shell primitives.
2. **All 7 Dev OS non-CFO cabinets share the same structural shape** (CabinetGreetingBlock + PageHeaderHero + 5–9 DashboardKpi + 2–4 Sections). Bringing them to gold standard is mechanically uniform: swap top stack for HeroGreetingAI, add KpiRowMixed above the existing snapshot-driven KPIs, add a Today's-pulse row (HatchedBarChart + HalfDonutGauge). Estimated 1–1.5 days/cabinet.
3. **Mgmt OS cabinets are inconsistent.** `/dashboard/front-office` and `/dashboard/owner` already use the 10.6.C.1 primitives (close to gold standard). `/dashboard/operations` (239 LOC) uses Stage-6 PageHeader/Section pattern with no DashboardKpi. `/dashboard/security` (42 LOC) is the lightest hub on the platform. `/dashboard/guest-services` (112 LOC) uses MetricCard only. The four laggards need a bigger lift than Dev OS.
4. **High-leverage new primitives** identified across the 12 audited cabinets: `<RoomStatusBoard>` (3 consumers), `<PhotoEvidenceGrid>` (3 consumers), `<PatrolTimeline>` (1 consumer but high pain), `<GuestArrivalsList>` (2 consumers), `<LeadFunnelChart>` (1 consumer but operator-facing every day), `<DistributionWaterfall>` (1 consumer — Investor portal). Other cabinets reuse existing primitives.
5. **Receipt OCR + bulk paste/XLSX import are highest-value cross-cabinet wins.** Procurement-manager, sales-manager, and housekeeping all have data-entry surfaces that match the bookkeeper pain pattern. Site-supervisor's "site report" is an OCR/photo-attach pattern.
6. **AI agents wired live today:** `tax-assistant` (Sprint 4 surfaces on cabinet apex), `qs-cost-analyst` (renders on CFO apex), `procurement-analyst`, `marketing-assistant`, `daily-construction-digest`, `weekly-construction-plan`, `executive-business`. Each maps to one cabinet's HeroGreetingAI's "ask anything" route.
7. **Investor Portal is structurally separate** — it uses `<PortalShell>` not `<DevelopmentShell>`. Bringing it to gold standard means proposing a parallel "InvestorHeroGreetingAI" pattern, not literally reusing the existing primitive (audience expectations differ — investors need report-grade not bookkeeper-style surfaces).
8. **Sequencing recommendation:** Procurement Manager → Site Supervisor → Sales Manager first (3 highest-daily-use, all benefit from existing primitives + 1 new each); QS + Project Manager + Warehouse + Marketing next (mechanical refactor); Front Office + Operations + Housekeeping next (Mgmt OS modernization batch); Investor Portal last (unique surface, needs distinct primitives). Security is a special case — recommend rebuilding into a real cabinet rather than refactoring the 42-LOC stub.
9. **Cabinet-by-cabinet effort total:** ~14 engineering days across 12 cabinets + 4 days for new primitives = **~18 days = 3–4 sprints**.

---

## Reference: Sprint 4 gold standard (recap)

Bookkeeper (CFO) cabinet at `/development-os/cabinets/cfo-accountant` carries:

- **`<HeroGreetingAI>`** at the top — date chip + "Show my tasks" pill + greeting + AI ask input + mic (Reference 1 silhouette).
- **3-tile quick-action strip** beneath the hero — links to quick-entry, import, and AI assistant with the latest output code in the caption.
- **4-up hero KPI grid** with `<DashboardKpi variant="hero" tone="ink-deep">` + 3 status-coded DashboardKpis, each carrying `<SparklineChart>` (Sprint 1).
- **30/60/90 cashflow forecast** — 3 small DashboardKpis with sparklines.
- **Bookkeeper workload** — 3 small status KPIs.
- **AI insights** — 3 ink-deep gradient cards (Sprint 4.5: last-3 tax-assistant outputs) + QS-cost-analyst card.
- **Recent transactions aside** on the right rail.
- **Today's pulse row** (Sprint 4 NEW) — `<HatchedBarChart>` (7-day transaction counts) + `<HalfDonutGauge>` (review-queue burn %).

Companion routes shipped Sprint 4 + 4.5:
- `/finance/transactions/quick-entry` — `<SpreadsheetView>` for Sheets-style daily entry.
- `/finance/transactions/import` — 3-tab import wizard (paste · XLSX · live Sheets placeholder) with column-mapping override + template save/load.
- `<ReceiptExtractor>` mounted above the SpreadsheetView — vision-AI OCR pre-fills a row, operator confirms.

Score: **5/5** vs the Reference 1 + Reference 2 operator screenshots. Every other cabinet is benchmarked against this.

---

## Cabinet D1 — Site Supervisor

**Path:** `/development-os/cabinets/site-supervisor` · **page.tsx:** 253 LOC.
**Loader:** `loadSiteSupervisorCabinet()`.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (×6 across 3 Sections).
**Score vs gold standard:** **3/5** — clean Stage-10.6.C.1 surface; missing HeroGreetingAI, KpiRowMixed, Today's-pulse, AI insights, no SpreadsheetView consumer, no import wizard, no receipt OCR.

### Primary daily use-case

- **Who:** Site supervisor on a construction project. Walks the site, files reports, escalates safety issues.
- **5+ times a day:** Site report submission with 3–10 photos + voice note (current friction: photo upload UX); reviewing today's QA/QC checklist; updating task progress.
- **1×/day:** Daily construction digest (AI-generated summary of yesterday's reports); reviewing risk-radar alerts for the project.
- **Weekly/monthly:** Weekly construction plan generation + review with PM; monthly safety review.
- **Biggest friction today:** Site report file uploads are modal-based (per audit of existing surface). On 4G in the field, photos take 30s+. No offline queue.

### Data-entry flows

- **Site report (5+/day):** Modal form. Should evolve to a mobile-first PWA surface (already exists at `/development-os/operations/site-reports`).
- **Task progress updates:** Inline grid OR modal? Currently page-based per-task. Could benefit from `<SpreadsheetView>`-style multi-task batch updates.
- **Photo upload:** Existing `<PhotoCapture>` primitive. Receipt-OCR-style structured extraction (vendor/amount) doesn't apply; but photo annotation + offline queue would.

### AI agent wiring

- **Relevant:** `daily-construction-digest` (live), `weekly-construction-plan` (live), `risk-radar` (if exists), `qs-cost-analyst` (cost-side insights).
- **HeroGreetingAI route:** "Show me yesterday's exceptions" → `daily-construction-digest`; "Plan this week" → `weekly-construction-plan`.
- **Above-the-fold AI suggestion:** Latest daily-digest summary (3-card grid like CFO's tax-assistant pattern).

### KPI candidates for `<KpiRowMixed>`

1. **Hero (emerald-solid):** Open site reports today (count + delta vs yesterday).
2. Active QA/QC items on this project.
3. Open safety incidents (status-coded warn/danger).
4. Today's task completion % (housekeeping-style burn).

All available from the existing `loadSiteSupervisorCabinet` snapshot — verify field names but no new query work expected.

### Cabinet-specific patterns

- **`<PatrolTimeline>`** (NEW PRIMITIVE) — timestamped events of "ground-level activity" — site reports filed, photos taken, incidents raised. Used here + by Security cabinet + Housekeeping.
- **`<PhotoEvidenceGrid>`** (NEW PRIMITIVE) — clickable thumbnail grid with status pill per photo (uploaded/syncing/failed). Mobile-first. Used here + Damage Reports + Housekeeping.
- **Existing reuses:** `<HatchedBarChart>` for daily report counts; `<HalfDonutGauge>` for today's checklist completion; `<TeamRowList>` for active subcontractors-on-site.

### Sprint shape

- **Estimated effort:** 1.5 days.
- **Mechanical:** Swap top stack for HeroGreetingAI; KpiRowMixed above existing DashboardKpis; Today's pulse row (existing primitives). [~0.75 day]
- **New:** Build `<PatrolTimeline>` + `<PhotoEvidenceGrid>` (shared with 2 other cabinets — leverage). [~0.75 day]
- **Commit breakdown:** (1) primitives, (2) cabinet rebuild + AI-digest 3-card grid.

---

## Cabinet D2 — QS / Quantity Surveyor

**Path:** `/development-os/cabinets/qs` · **page.tsx:** 176 LOC.
**Loader:** `loadQsCabinet()`.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (×5 across 2 Sections).
**Score vs gold standard:** **3/5** — leanest of the Dev OS 7; structure is solid but minimal.

### Primary daily use-case

- **Who:** Quantity surveyor / cost engineer for a development project. Reviews BoQ lines, tracks variances, validates cost categorizations.
- **5+ times a day:** Reviewing BoQ entries flagged by AI for unusual unit cost; categorizing materials.
- **1×/day:** Variance report vs baseline; reviewing change orders.
- **Weekly:** Monthly cost-control roll-up; AI run of qs-cost-analyst.
- **Biggest friction:** BoQ entry today is page-by-page (per `/development-os/boq` audit). Operator can't paste BoQs from Excel — every cabinet that touches BoQ (QS, PM, Procurement) suffers.

### Data-entry flows

- **BoQ line edit/create:** Page-based. **Strong candidate for `<SpreadsheetView>`** — operator has whole BoQs in Excel today (the spec called this out originally).
- **Variance approval:** Modal. Stays modal.
- **Cost re-categorization:** Modal. Could benefit from inline picker.

### AI agent wiring

- **Relevant:** `qs-cost-analyst` (live), `tax-assistant` (cross-cabinet, secondary).
- **HeroGreetingAI route:** "Anomalies this week" → `qs-cost-analyst`.
- **Above-the-fold AI suggestion:** Last-3 qs-cost-analyst runs (mirror the CFO pattern from Sprint 4.5).

### KPI candidates for `<KpiRowMixed>`

1. **Hero (gold-solid):** BoQ lines awaiting QS review.
2. Project budget variance (%, status-coded).
3. Open change orders.
4. AI anomalies flagged this week.

### Cabinet-specific patterns

- **`<BoqGrid>`** (NEW PRIMITIVE) — purpose-built `<SpreadsheetView>` variant with BoQ-specific columns (item code · description · unit · qty · unit cost · subtotal · category · supplier). Could be a `<SpreadsheetView>` wrapper rather than a new primitive — propose **REUSES EXISTING**.
- **Existing reuses:** `<HatchedBarChart>` for daily anomaly counts; `<HalfDonutGauge>` for BoQ-review-queue burn; `<DonutRatioCard>` for budget burn %.

### Sprint shape

- **Estimated effort:** 1 day.
- **Mechanical:** HeroGreetingAI swap; KpiRowMixed; Today's pulse; AI 3-card grid. [~0.5 day]
- **BoQ quick-entry route** at `/development-os/boq/quick-entry`: wraps `<SpreadsheetView>` with BoQ columns + bulkInsertBoqLines server action (server-side resolution patterns match Sprint 4 bookkeeper). [~0.5 day]

---

## Cabinet D3 — Project Manager

**Path:** `/development-os/cabinets/project-manager` · **page.tsx:** 264 LOC.
**Loader:** `loadProjectManagerCabinet()`.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (×6 across 3 Sections).
**Score vs gold standard:** **3/5**.

### Primary daily use-case

- **Who:** Project manager owning a development project end-to-end. Coordinates Site Supervisor + QS + Procurement + Finance.
- **5+ times a day:** Reviewing project health KPIs; assigning tasks; checking site reports.
- **1×/day:** Reviewing daily digest; replying to investor questions.
- **Weekly/monthly:** Monthly stakeholder report.
- **Biggest friction:** No single "today's snapshot" — PM has to open 5 different cabinet surfaces to get a daily picture.

### Data-entry flows

- **Task assignment:** Modal. Could benefit from kanban-board interaction (existing `<KanbanBoard>` primitive at Stage 10.B — but unused).
- **Project status updates:** Modal. Stays modal.
- **No bulk-entry pain point.** PM is a consumer of data, not a daily producer.

### AI agent wiring

- **Relevant:** `daily-construction-digest`, `weekly-construction-plan`, `executive-business`, `risk-radar`.
- **HeroGreetingAI route:** "Brief me on today" → `daily-construction-digest`.
- **Above-the-fold AI suggestion:** Daily digest + weekly plan side-by-side.

### KPI candidates

1. **Hero (emerald-solid):** Active projects (with trend).
2. Open QA/QC items (status-coded).
3. Open risks (status-coded).
4. Pending change orders.

### Cabinet-specific patterns

- **`<KanbanBoard>` consumer** — existing primitive, never used. PM is a natural fit for task-pipeline visualization.
- **Existing reuses:** `<TeamRowList>` for active subcontractors; `<HatchedBarChart>` for daily activity; `<DonutRatioCard>` for project completion %.

### Sprint shape

- **Estimated effort:** 1 day (mechanical only; no new primitives).
- **Highest pure-mechanical win in the audit.**

---

## Cabinet D4 — Procurement Manager

**Path:** `/development-os/cabinets/procurement-manager` · **page.tsx:** 180 LOC.
**Loader:** `loadProcurementCabinet()`.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (×5 across 2 Sections).
**Score vs gold standard:** **3/5**.

### Primary daily use-case

- **Who:** Procurement officer. Issues PRs, compares quotations, creates POs, tracks deliveries.
- **5+ times a day:** Creating PRs; reviewing quotations; approving POs.
- **1×/day:** Reviewing AI anomaly suggestions on price increases.
- **Weekly/monthly:** Supplier scorecard review.
- **Biggest friction:** Quotation comparison today is modal-by-modal — comparing 5 suppliers means 5 modal opens. Operator wants matrix view.

### Data-entry flows

- **PR creation:** Page form + line-items modal. **High candidate for `<SpreadsheetView>`** (operator pastes RFQ responses from email/Sheets).
- **Quotation entry:** Modal per-line. **`<RfqMatrix>` primitive exists** (Stage 10.B) but unused — natural fit.
- **PO approval:** Modal. Stays.

### AI agent wiring

- **Relevant:** `procurement-analyst` (live).
- **HeroGreetingAI route:** "Compare quotations on PR-00412" → `procurement-analyst`.
- **Above-the-fold AI suggestion:** Last procurement-analyst output + low-stock + overdue-delivery flags.

### KPI candidates

1. **Hero (coral-solid):** Open PRs awaiting quotation.
2. Quotations awaiting comparison.
3. Overdue deliveries (status-coded danger).
4. Spend MTD (with delta).

### Cabinet-specific patterns

- **`<RfqMatrix>` consumer** — existing primitive, never used. Natural fit for the quotation-comparison pain.
- **`<SpreadsheetView>` for quotation paste** — operator pastes 5 supplier responses, picks winner inline.
- **Existing reuses:** `<HatchedBarChart>` for daily PR activity; `<HalfDonutGauge>` for "delivered vs ordered" ratio.

### Sprint shape

- **Estimated effort:** 1.5 days.
- **Mechanical:** cabinet rebuild + AI 3-card grid. [~0.5 day]
- **`<RfqMatrix>` wiring** into `/development-os/procurement/quotation-comparison`: route exists but not built out. [~0.5 day]
- **Quotation paste import** at `/development-os/procurement/quotations/import`: reuse Sprint 4's import-wizard pattern. [~0.5 day]

---

## Cabinet D5 — Warehouse Manager

**Path:** `/development-os/cabinets/warehouse-manager` · **page.tsx:** 172 LOC.
**Loader:** `loadWarehouseCabinet()`.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (×6 across 2 Sections).
**Score vs gold standard:** **3/5**.

### Primary daily use-case

- **Who:** Warehouse / inventory clerk. Receives deliveries, books movements, runs stocktakes.
- **5+ times a day:** Logging delivery receipt; updating stock movements; checking low-stock alerts.
- **1×/day:** Confirming yesterday's deliveries against POs.
- **Weekly/monthly:** Full stocktake.
- **Biggest friction:** Stock movement entry is page-based. Stocktake is one-item-at-a-time. Both are heavy `<SpreadsheetView>` candidates.

### Data-entry flows

- **Stock movement:** Page form. **Strong `<SpreadsheetView>` candidate.**
- **Stocktake:** Page-by-location, one-item-at-a-time. **Highest `<SpreadsheetView>` candidate in the audit.**
- **Delivery receipt:** Modal + photo. Could use `<PhotoCapture>` + receipt-OCR (delivery slip OCR).

### AI agent wiring

- **Relevant:** `procurement-analyst` (cross-cabinet, secondary).
- **HeroGreetingAI route:** "What's low this week?" → tax-assistant or new dedicated `inventory-watch` agent.
- **Above-the-fold AI suggestion:** Low-stock items (today exists as a cron `dev-os-inventory-low-stock-alert` — surface its latest output here).

### KPI candidates

1. **Hero (gold-solid):** Items below threshold (low-stock count).
2. Pending deliveries.
3. Stocktake variance from last count (%).
4. Days since last full stocktake.

### Cabinet-specific patterns

- **`<SpreadsheetView>` quick-entry for stock movements** — pattern reuses Sprint 4 bookkeeper recipe verbatim.
- **`<SpreadsheetView>` for stocktake** — operator walks aisles with phone, types counts. Mobile UX needs polish; deferred to v2.
- **`<PhotoEvidenceGrid>` for delivery photos.**
- **Existing reuses:** `<HatchedBarChart>` for daily movement counts; `<HalfDonutGauge>` for stock-health ratio.

### Sprint shape

- **Estimated effort:** 1.5 days.
- **Mechanical cabinet rebuild.** [~0.5 day]
- **Stock movement quick-entry route** at `/development-os/inventory/movements/quick-entry`. [~0.5 day]
- **Stocktake quick-entry route** at `/development-os/inventory/stocktake/quick-entry`. [~0.5 day]

---

## Cabinet D6 — Sales Manager

**Path:** `/development-os/cabinets/sales-manager` · **page.tsx:** 221 LOC.
**Loader:** `loadSalesCabinet()`.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (×9 across 3 Sections — densest non-CFO cabinet).
**Score vs gold standard:** **3/5**.

### Primary daily use-case

- **Who:** Sales manager. Owns the lead → buyer pipeline, tracks reservations, runs the sales funnel.
- **5+ times a day:** Updating lead status; reviewing today's conversations; logging buyer contacts.
- **1×/day:** Pipeline review; running marketing-assistant for content.
- **Weekly:** Funnel-stage roll-up; manager-performance review.
- **Biggest friction:** Lead-funnel visualization today is text-only. Operator wants a real funnel chart (Reference 2 patterns).

### Data-entry flows

- **Lead entry:** Modal. Mostly OK.
- **Conversation log:** Modal. Mostly OK.
- **Buyer contact:** Modal. Mostly OK.
- **No bulk-paste pain.** Sales is qualitative; one lead at a time.

### AI agent wiring

- **Relevant:** `marketing-assistant` (live).
- **HeroGreetingAI route:** "Draft a follow-up for {lead}" → `marketing-assistant`.
- **Above-the-fold AI suggestion:** Marketing-assistant's latest content draft + missed-follow-up flags.

### KPI candidates

1. **Hero (emerald-solid):** Open leads (pipeline value).
2. Conversions this month (count + $).
3. Average days-to-close (status-coded by velocity).
4. Top-of-funnel inbound this week.

### Cabinet-specific patterns

- **`<LeadFunnelChart>`** (NEW PRIMITIVE) — visual funnel with %-conversion at each stage. Pure SVG. Used here + on Marketing cabinet.
- **`<SalesPipelineKanban>`** — wrap existing `<KanbanBoard>` with sales-specific column model.
- **Existing reuses:** `<HatchedBarChart>` for daily conversations; `<DonutRatioCard>` for win-rate %; `<TeamRowList>` for top reps.

### Sprint shape

- **Estimated effort:** 1.5 days.
- **Mechanical cabinet rebuild + AI grid.** [~0.5 day]
- **`<LeadFunnelChart>` primitive** + wiring into the cabinet. [~0.75 day]
- **`<SalesPipelineKanban>` adapter** over existing `<KanbanBoard>`. [~0.25 day]

---

## Cabinet D7 — Marketing Staff

**Path:** `/development-os/cabinets/marketing-staff` · **page.tsx:** 234 LOC.
**Loader:** `loadMarketingCabinet()`.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (×8 across 4 Sections — most-Sections non-CFO).
**Score vs gold standard:** **3/5**.

### Primary daily use-case

- **Who:** Marketing staff. Owns content publishing, ad campaigns, lead-source attribution.
- **5+ times a day:** Scheduling content; reviewing campaign performance; replying to inbound.
- **1×/day:** Lead-source attribution review.
- **Weekly:** Cross-channel performance recap.
- **Biggest friction:** Lead-source attribution today is page-by-page. Manager-performance recompute is a cron with no UI surface.

### Data-entry flows

- **Content scheduling:** Modal. OK.
- **Campaign edit:** Modal. OK.
- **No bulk-paste pain.**

### AI agent wiring

- **Relevant:** `marketing-assistant` (live).
- **HeroGreetingAI route:** "Draft an Instagram caption" → `marketing-assistant`.
- **Above-the-fold AI suggestion:** Latest marketing-assistant content drafts (mirror CFO's tax-assistant pattern).

### KPI candidates

1. **Hero (coral-solid):** Content scheduled this week.
2. Active campaigns.
3. Inbound leads this week (with delta).
4. Top-attributed source MTD.

### Cabinet-specific patterns

- **`<LeadFunnelChart>` consumer** — shared with Sales Manager.
- **`<ContentCalendarStrip>`** (NEW PRIMITIVE — but could be `<HatchedBarChart>` with date axis). Mark as **REUSES EXISTING** with a wrapper.
- **Existing reuses:** `<HatchedBarChart>` for daily publish cadence; `<DonutRatioCard>` for channel split.

### Sprint shape

- **Estimated effort:** 1 day (depends on `<LeadFunnelChart>` from Sales sprint).

---

## Cabinet M1 — Property Manager / Front Office

**Path:** `/dashboard/front-office` · **page.tsx:** 213 LOC.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi` (across 3 Sections).
**Score vs gold standard:** **3/5** — already on 10.6.C.1 primitives.

### Primary daily use-case

- **Who:** Property manager / front-office operator. Handles arrivals, departures, in-house guest issues, owner communications.
- **5+ times a day:** Checking today's arrivals; logging guest requests; updating villa status.
- **1×/day:** Reviewing tomorrow's check-ins; SLA escalations.
- **Weekly:** Owner statements + payouts.
- **Biggest friction:** Villa status board is text-list today. Operator wants a visual grid by villa + day.

### Data-entry flows

- **Guest request:** Modal. OK.
- **Villa status update:** Inline pill click. OK.
- **No bulk-paste pain.**

### AI agent wiring

- **Relevant:** No Mgmt-OS-dedicated AI agent today. **Gap.** Concierge AI (`/dashboard/guest-ai`) is guest-facing, not operator-facing.
- **HeroGreetingAI route:** "Today's exceptions" — would need a new `front-office-copilot` agent (deferred).

### KPI candidates

1. **Hero (emerald-solid):** Tonight's occupancy (booked/total villas).
2. Arrivals today.
3. Departures today.
4. Open guest requests.

### Cabinet-specific patterns

- **`<RoomStatusBoard>`** (NEW PRIMITIVE — high-leverage) — villa × day matrix, color-coded by status. Used here + Operations + Owner Portal.
- **`<GuestArrivalsList>`** (NEW PRIMITIVE) — timed list with arrival window + flight info. Used here + Concierge.
- **Existing reuses:** `<HatchedBarChart>` for daily occupancy 7-day; `<HalfDonutGauge>` for SLA-on-track %; `<CommsPanel>` for guest-request inbox.

### Sprint shape

- **Estimated effort:** 2 days (new primitives weigh it down).

---

## Cabinet M2 — Security

**Path:** `/dashboard/security` · **page.tsx:** 42 LOC. ⚠️ **lightest hub on the platform.**
**Current primitives:** `MetricCard` only (Stage-6 baseline).
**Score vs gold standard:** **1/5** — barely a stub. Just camera count + a single jump-link.

### Primary daily use-case

- **Who:** Security supervisor. Reviews CCTV events, logs patrol incidents, manages access control.
- **5+ times a day:** Logging patrol events; reviewing camera alerts; updating access control.
- **1×/day:** Patrol shift handover.
- **Weekly:** Incident roll-up.
- **Biggest friction:** Cabinet doesn't exist as a real operator surface yet. Today it's a camera registry list and nothing else.

### Data-entry flows

- **Patrol event log:** Doesn't exist as a UI today. **Needs design + build.**
- **Incident report:** Doesn't exist.
- **Access control event:** Page-based at `/dashboard/security/events`.

### AI agent wiring

- **None.** Recommend defer until cabinet exists.

### KPI candidates

1. **Hero (ink-deep):** Open incidents.
2. Patrol completion % today.
3. Camera health (active/total).
4. Access events this week.

### Cabinet-specific patterns

- **`<PatrolTimeline>`** (NEW PRIMITIVE — shared with Site Supervisor) — timestamped events with status pills.
- **`<IncidentList>`** — could be `<TeamRowList>` wrapper.
- **`<CameraGrid>`** — existing surface, but needs visual polish.

### Sprint shape

- **Estimated effort:** 3 days. **This is a rebuild, not a refactor.** Recommend operator decide before Sprint 6+: scope this as "Security MVP" (new cabinet) vs "Security polish" (stay close to current 42-LOC stub).

---

## Cabinet M3 — Housekeeping / Cleaners

**Path:** `/dashboard/operations/housekeeping` (NOT a cabinet apex today; sub-page of `/dashboard/operations`).
**Current primitives:** Inherited from `/dashboard/operations` (239 LOC, Stage-6 PageHeader pattern).
**Score vs gold standard:** **2/5** — operations hub uses no 10.6.C.1 primitives; housekeeping page-of-hub even less.

### Primary daily use-case

- **Who:** Housekeeping supervisor + cleaners. Assigns turnover tasks, verifies completion with photos.
- **5+ times a day (cleaner):** Mark task in-progress / awaiting-approval / done; upload photos.
- **5+ times a day (supervisor):** Approve completed tasks; reassign late ones.
- **1×/day:** Tomorrow's turnover plan.
- **Biggest friction:** Mobile UX for cleaners. Photos take forever on 4G. No offline queue.

### Data-entry flows

- **Task status update:** Inline pill click on `<TaskCard>` (existing).
- **Photo upload:** Modal per-task. Should integrate `<PhotoCapture>` + `<PhotoEvidenceGrid>`.
- **No bulk-paste pain.** Housekeeping is task-by-task, not data-entry-heavy.

### AI agent wiring

- **Relevant:** None today. Could use a `housekeeping-scheduler` agent (predict tomorrow's turnovers).
- **HeroGreetingAI route:** "What's running late?" — deferred until agent exists.

### KPI candidates

1. **Hero (emerald-solid):** Today's turnovers completed (count + %).
2. Awaiting approval.
3. In progress.
4. Tomorrow's turnovers.

### Cabinet-specific patterns

- **`<RoomStatusBoard>` consumer** (shared with Front Office).
- **`<PhotoEvidenceGrid>` consumer** (shared with Site Supervisor + Damage Reports).
- **`<MobileTaskCard>`** — existing primitive at Stage 10.B; never used. Natural fit.

### Sprint shape

- **Estimated effort:** 2 days. Half of it is making the surface a real cabinet apex (it's a sub-page today).

---

## Cabinet M4 — Owner Portal

**Path:** `/owner` (Mgmt OS, not `/dashboard/owner-intelligence` — that's the staff-facing surface) · **page.tsx:** 326 LOC.
**Current primitives:** `CabinetGreetingBlock`, `PageHeaderHero`, `DashboardKpi`.
**Score vs gold standard:** **4/5** — already comprehensive. **Light audit per spec.**

### Primary daily use-case

- **Who:** Villa owner. Read-mostly. Reviews statements, payouts, occupancy, requests owner stays.
- **Friction:** Operator-noted — owner statements are accurate but visually dense. Some owners want monthly summary email + a "trust score" feel.

### Existing primitives + scope

- Already uses 10.6.C.1 pattern.
- No bulk-paste needed (owners don't enter data).
- AI assistant: out of scope for V1 (read-mostly surface).

### Sprint shape

- **Estimated effort:** 0.5 day — light polish only.
- **Defer to "owner experience polish" sprint (e.g. Sprint 7+); not Sprint 6 priority.**

---

## Cabinet M5 — Concierge / Guest Experience

**Path:** `/dashboard/guest-ai` (admin surface) + `/dashboard/guest-services` (service catalog) + `/dashboard/guest-journey`.
**Current primitives:** `MetricCard` + `PageHeader` (Stage-6 baseline across all three).
**Score vs gold standard:** **2/5** — three separate hubs, none on 10.6.C.1.

### Primary daily use-case

- **Who:** Concierge operator (or AI-augmented host). Handles guest requests, recommends services, escalates to humans.
- **5+ times a day:** Reviewing guest-AI sessions; responding to human-handoff cases; updating guest profile preferences.
- **1×/day:** Reviewing yesterday's guest-AI quality (response time, satisfaction).
- **Biggest friction:** Three hubs (guest-ai, guest-services, guest-journey) are conceptually one cabinet — operator has to bounce between them.

### Data-entry flows

- **Service catalog edits:** Page-based.
- **Guest profile updates:** Modal.
- **No bulk-paste pain in V1.**

### AI agent wiring

- **Concierge AI** is the *user-facing* agent (already wired). The operator-facing surface here renders sessions + handoffs from that agent.
- **HeroGreetingAI route:** "What needs human attention right now?" — synthetic across handoff_count + escalation_count tables.

### KPI candidates

1. **Hero (coral-solid):** Active concierge sessions.
2. Awaiting human handoff.
3. Service orders today.
4. Avg response latency (status-coded).

### Cabinet-specific patterns

- **`<CommsPanel>` consumer** (existing — perfect fit for the inbox).
- **`<GuestArrivalsList>` consumer** (shared with Front Office).
- **Optional consolidation:** merge guest-ai + guest-services + guest-journey into one cabinet apex at `/dashboard/concierge`. Operator decision needed.

### Sprint shape

- **Estimated effort:** 1.5–3 days depending on consolidation decision.

---

## Cabinet I1 — Investor Portal

**Path:** `/investor-portal/dashboard` · **uses `<PortalShell>`** (separate shell from DevelopmentShell).
**Score vs gold standard:** **N/A** — different audience, different reference. Currently uses bespoke portal-shell primitives.

### Primary daily use-case

- **Who:** Institutional or HNW investor. Read-only. Reviews commitments, distributions, forecasts.
- **5+ times a day:** Not daily. Weekly or monthly check-in is normal.
- **Friction:** Bilingual support (existing `getPortalStrings(reportingLanguage)`). Visual richness expected by investors is *more* than operators — Reference 1's "Main Stocks" / "Annual Profits" stack is closer to investor-grade than Reference 2's bookkeeper feel.

### Data-entry flows

- **None for investors.** They don't enter data; they request things via `<InvestorRequest>` form.

### AI agent wiring

- **Relevant:** None today. Could use a "explain my distribution" agent (Reference 1's "Hey, need help?" pattern fits perfectly here — but investor-grade tone).
- **HeroGreetingAI route:** "What changed in my position this quarter?" — needs a new `investor-copilot` agent.

### KPI candidates

1. **Hero (ink-deep):** Total commitment value.
2. Distributions YTD.
3. IRR / MOIC.
4. Open requests.

### Cabinet-specific patterns

- **`<DistributionWaterfall>`** (NEW PRIMITIVE) — investor-grade waterfall chart. Pure SVG. Reference 1's gradient hero card style.
- **`<InvestorHeroGreetingAI>`** — investor-tone variant of HeroGreetingAI (no emoji, formal language, "Reports" not "Tasks").
- **Existing reuses:** `<DonutRatioCard>` for commitment vs called %; `<AreaChartCard>` for forecast cashflow.

### Sprint shape

- **Estimated effort:** 3–4 days. Different shell, different tone, new primitive.
- **Recommend treating this as a distinct sprint** — not bundled with Dev OS cabinet refactors.

---

## Cross-cabinet synthesis

### A. New primitives inventory

| Primitive | Consumers | Notes |
|---|---:|---|
| `<RoomStatusBoard>` | 3 (Front Office, Operations, Owner) | Villa × day matrix, color-coded |
| `<PhotoEvidenceGrid>` | 3 (Site Supervisor, Housekeeping, Damage Reports) | Mobile-first thumbnail grid with sync status |
| `<PatrolTimeline>` | 2 (Site Supervisor, Security) | Timestamped event stream with status pills |
| `<GuestArrivalsList>` | 2 (Front Office, Concierge) | Timed list with flight + arrival-window |
| `<LeadFunnelChart>` | 2 (Sales Manager, Marketing Staff) | Pure SVG funnel with stage conversion % |
| `<DistributionWaterfall>` | 1 (Investor Portal) | Investor-grade waterfall chart |
| `<InvestorHeroGreetingAI>` | 1 (Investor Portal) | Formal-tone variant of HeroGreetingAI |
| `<BoqGrid>` (REUSES `<SpreadsheetView>`) | 1 (QS) | Wrapper, not new primitive |
| `<SalesPipelineKanban>` (REUSES `<KanbanBoard>`) | 1 (Sales) | Wrapper, not new primitive |

**Highest leverage:** `<RoomStatusBoard>` + `<PhotoEvidenceGrid>` (3 consumers each) + `<PatrolTimeline>` (1 fewer consumer but highest pain).

### B. Shared sprint vs inline primitive creation

**Recommend: inline with each cabinet sprint**, NOT a separate primitive-batch sprint.

Rationale:
- Each new primitive has a clear first consumer. Building it inline gives an immediate user.
- Sprint 4's pattern (build 5 award primitives + immediately consume them on the bookkeeper cabinet) worked well — same shape carries.
- The "shared sprint" approach risks building primitives speculatively that the consumer doesn't quite need.
- Highest-leverage primitives (`<RoomStatusBoard>`, `<PhotoEvidenceGrid>`) emerge naturally in the Front Office + Site Supervisor sprints; subsequent cabinets benefit immediately.

**Risk:** primitive churn — if Site Supervisor ships `<PhotoEvidenceGrid>` v1 and Damage Reports needs a slightly different version, we'd rev. Mitigation: each primitive has explicit "expected consumers" comments + a 2-cabinet dogfood before locking the API.

### C. Suggested cabinet sequencing (recommendation)

Ranked by combined operator-daily-use × user-pain × implementation-leverage:

| # | Cabinet | Sprint | Why first / why now |
|---|---|---|---|
| 1 | **Procurement Manager** (D4) | 6 | Existing `<RfqMatrix>` + `<SpreadsheetView>` ready to wire; high daily use; quotation-comparison pain is sharp |
| 2 | **Site Supervisor** (D1) | 7 | Builds the highest-leverage new primitives (`<PatrolTimeline>` + `<PhotoEvidenceGrid>`) which 2 later cabinets reuse |
| 3 | **Sales Manager** (D6) | 8 | Builds `<LeadFunnelChart>` (shared with Marketing); operator-daily use is high |
| 4 | **Warehouse Manager** (D5) | 9 | Two SpreadsheetView consumers (movements + stocktake) replay the bookkeeper recipe |
| 5 | **Project Manager** (D3) | 10 | Pure mechanical refactor + KanbanBoard consumer; fast |
| 6 | **QS** (D2) | 11 | Mechanical + BoQ SpreadsheetView (depends on Procurement patterns landing first) |
| 7 | **Marketing Staff** (D7) | 12 | Cheapest of the Dev OS refactors (depends on Sales' `<LeadFunnelChart>`) |
| 8 | **Front Office** (M1) | 13 | First Mgmt OS cabinet sprint; builds `<RoomStatusBoard>` + `<GuestArrivalsList>` |
| 9 | **Housekeeping** (M3) | 14 | Consumes Front Office's primitives; mobile UX polish |
| 10 | **Concierge** (M5) | 15 | Hub consolidation decision needed (operator) |
| 11 | **Security** (M2) | 16 | Rebuild not refactor — needs operator scoping first |
| 12 | **Investor Portal** (I1) | 17 | Distinct shell + tone; standalone sprint |

Owner Portal (M4) excluded — already at 4/5 with light polish need.

### D. AI agent wiring gaps

Cross-cabinet view of which agents are live + where they surface:

| Agent | Live? | Already surfaces on | Should also surface on |
|---|:-:|---|---|
| `tax-assistant` | ✅ | CFO cabinet | Procurement (cost classification) |
| `qs-cost-analyst` | ✅ | CFO cabinet | QS cabinet (primary) |
| `procurement-analyst` | ✅ | (none) | Procurement cabinet (primary) |
| `marketing-assistant` | ✅ | (none) | Sales + Marketing cabinets |
| `daily-construction-digest` | ✅ | (none) | Site Supervisor + Project Manager |
| `weekly-construction-plan` | ✅ | (none) | Project Manager + Site Supervisor |
| `executive-business` | ✅ | (none) | Project Manager + Investor Portal |
| `front-office-copilot` | ❌ NEW | n/a | Front Office (deferred — needs scoping) |
| `housekeeping-scheduler` | ❌ NEW | n/a | Housekeeping (deferred — low priority for V1) |
| `investor-copilot` | ❌ NEW | n/a | Investor Portal (defer to Investor sprint) |

**Pattern:** 7 of 7 live agents already exist; only Mgmt OS + Investor Portal lack dedicated agents. **No agent backend work required for Sprints 6–12** (Dev OS cabinet sprints). Mgmt OS sprints (13+) need to decide whether to wait for new agents or ship cabinets without HeroGreetingAI's AI input wired live.

### E. Import flow needs (ranked)

Cabinets that would benefit from a Sprint-4-style import wizard:

| # | Cabinet | What's imported | Volume estimate | Priority |
|---|---|---|---|---|
| 1 | **QS / BoQ** | Bill-of-quantities lines | Hundreds/project | HIGH |
| 2 | **Procurement** | Quotation responses | Tens/PR | HIGH |
| 3 | **Warehouse** | Stock movements (batch receipt) | Dozens/day | MEDIUM |
| 4 | **Warehouse** | Stocktake counts | Hundreds/quarter | MEDIUM |
| 5 | **Marketing** | Bulk lead import from CSV | Dozens/campaign | LOW |
| 6 | **Sales** | Bulk lead import | Dozens/campaign | LOW |

Bookkeeper already shipped (Sprint 4). Other cabinets are one-time bulk-paste flows rather than daily-driver pain points.

### F. Ranked operator decisions (8 items)

1. **Inline-vs-shared sprint for new primitives.** Recommend **inline** (Sprint 6 = Procurement cabinet + RfqMatrix wiring; Sprint 7 = Site Supervisor + new primitives; etc.).
2. **Security: rebuild vs polish.** Today it's 42 LOC. Operator decides: is this a real operational surface (3-day rebuild) or paper-only (skip)?
3. **Concierge consolidation.** Three hubs (guest-ai, guest-services, guest-journey) — merge into `/dashboard/concierge` cabinet apex, or keep separate? Recommend **merge** (matches the bookkeeper pattern: one cabinet apex + sub-routes).
4. **Sequencing: Procurement first or Site Supervisor first?** I recommend Procurement (existing primitives wire cleanly, RfqMatrix is the highest-leverage existing-but-unused primitive). Operator may prefer Site Supervisor if field-team friction is sharper.
5. **Mgmt OS HeroGreetingAI without a live agent.** Front Office + Housekeeping + Concierge have no dedicated Mgmt-OS agent today. Ship HeroGreetingAI shells without "ask anything" wired (just the visual pattern), OR delay Mgmt OS sprints until a Mgmt-OS agent exists? Recommend **ship visual shells**; the AI input degrades gracefully ("AI assistant coming soon").
6. **Investor Portal scope.** Bring to gold standard (3–4 days) OR defer to a dedicated investor-experience sprint after Dev OS is done? Recommend **defer** — the audience is different and the audit's gold standard is operator-focused.
7. **Owner Portal polish.** It's already 4/5. Polish in Sprint 6+ OR leave alone? Recommend **leave for now**; revisit when operator hears specific owner-side complaints.
8. **Per-cabinet sprint length.** Sprints 1–4 averaged ~1.5–2 days each; the audit projects 1–2 days per cabinet refactor + 0.5–1 day for any new primitive. Recommend keeping the **one-cabinet-per-sprint cadence** so each landing can be reviewed independently.

---

## Halt — no code changes; ready for operator direction on which cabinet sprint to start first.
