# Stage 10 UX Research — Executive Summary

**Date:** 2026-05-08
**Phase:** 10.A (BLOCKING; 1 week)
**Inputs:** 11 reference-app catalogs (33 apps), 11 role briefs, interview guide. Operator-side interviews in flight.
**Output of this doc:** cross-role themes, Stage 10 phase-ordering rationale, design-system primitive list for 10.B, scope cuts.

---

## Cross-role themes (named by ≥3 of 11 reference-app catalogs)

### Theme 1 — Mobile-first ≠ desktop-shrunk

Surfaced by: cleaner, warehouse, procurement, front-office, owner, project-manager, marketing reference catalogs.

Every catalog independently flagged "mobile = shrunk desktop grid" as the dominant anti-pattern. Cleaners are phone-only; warehouse staff are phone-primary; procurement does delivery acceptance on phone; PMs do site reports on tablet; owners check positions on phone; front-office floor-patrols on phone. **The mobile experience must be ruthlessly task-scoped per role, not a parity port.**

Implication for Stage 10:
- **10.B Design System** must ship two distinct primitive families: desktop (spreadsheet, matrix, drill-down panel, Gantt) and mobile (task-card, photo-capture, voice-note, single-action-per-screen).
- **10.M Mobile Optimization** is not just polish — it's the gate for cleaner adoption (10.D), warehouse, and field workflows.

### Theme 2 — Kanban / timeline / matrix as primary surface

Surfaced by: marketing (Kanban funnel), front-office (journey timeline), procurement (RFQ matrix), project-manager (Gantt timeline).

These four phases all ship variants of the same primitive: **rows × columns × draggable cards with status transitions**. Today, each cabinet would build its own. Stage 10.B must extract this.

Specifically:
- **KanbanBoard** primitive: column-defined-stages, draggable cards, SLA-aging-color, click → side panel. Used by marketing (10.I), procurement queue.
- **Timeline** primitive: lifecycle stages with status badges + required-fields gate per transition. Used by front-office (10.K), owner capital-call sequence (10.J).
- **RFQMatrix** primitive: rows × columns of comparable values with auto-winner highlight. Used by procurement (10.H), QS bid-comparison (cross-cuts 10.E).

### Theme 3 — Drill-down with provenance

Surfaced by: CFO (KPI → tx), QS (BoQ → stroke), owner (IRR → source-tx), bookkeeper (reconciliation → match), procurement (variance → 3-way-match).

**Every aggregate must carry its source.** Side-panel-drill-down (no page reload) is the pattern. CFO loses trust on first un-traceable number; owner loses trust on first un-traceable IRR.

Implication: **DrillDownPanel** is a 10.B primitive. Used by CFO (10.G), owner (10.J), bookkeeper period-close (10.C), QS (10.E).

### Theme 4 — Required-fields-per-stage gating

Surfaced by: front-office ("no check-in without ID + payment + signature"), marketing ("no Booked without deposit"), cleaner ("no Done without photo"), QS ("no BoQ line without measurement"), procurement ("no PO award without 3 quotes if value > X").

**Stage transitions must enforce data quality at the gate.** This converts the lifecycle-FSM Stage 7 already shipped into a UX primitive: every state transition has a required-fields rule, and the UI surfaces the missing items inline.

Implication: not a new component, but a **shared transition-guard helper** in `src/lib/ui/`. Powers all role-specific phase transitions.

### Theme 5 — Auto-message-with-edit-before-send

Surfaced by: marketing (HubSpot pattern), front-office (Hostfully pattern), procurement (vendor RFQ blast).

**Lifecycle-triggered drafts, never full automation.** Stage 7.D's Stripe webhook pattern (auto-state-change but with audit trail) is the analog. Front-office staff and marketing managers both rejected "send-on-trigger" automation in reference-app reviews. The surface they want: pre-filled draft + visible Send button.

### Theme 6 — Excel parity is non-negotiable

Surfaced by: bookkeeper, QS, CFO, procurement. **Every analytical role expects xlsx round-trip.** Bookkeepers expect spreadsheet-like keyboard nav (Tab/Enter/Ctrl-D). QS expects BoQ import/export. CFO expects underlying-data export with every chart. Procurement expects RFQ matrix to be Excel-shaped.

Implication: **SpreadsheetView** primitive in 10.B. Tab-cell-nav, paste-from-Excel, copy-to-Excel, autocomplete-from-history. Used by bookkeeper (10.C), QS (10.E), procurement (10.H).

### Theme 7 — Unified inbox

Surfaced by: marketing (5+ channels), front-office (channel + direct), procurement (vendor comms).

**One thread, channel-source badges per message.** The current `/development-os/inbox` is direct-only; channel inbox at `/development-os/channels/inbox` is separate. These must merge.

Implication: existing `inbox` infrastructure consolidates in 10.B + reused by 10.I + 10.K.

### Theme 8 — Lifecycle-event-driven auto-tasks

Surfaced by: front-office (Cloudbeds/Mews), operations-manager (Guesty/Hostaway), marketing (HubSpot triggers).

**Reservation events → ops tasks** without manual handoff. Pattern: reservation transitions to "Confirmed" → cleaner turnover task auto-created for checkout day; PM RFI marked "Approved" → site-supervisor reminder fires. Already partially implemented in the cron stack (Stage 7.C lifecycle FSM); 10.K + 10.D consume.

---

## Stage 10 phase-ordering rationale

The plan as written: 10.B Design System → 10.C-10.K role phases (sequential or parallel) → 10.L AI Cross-Integration → 10.M Mobile Optimization → 10.N Polish.

Research findings suggest minor adjustments:

| Phase | Original cadence | Suggested adjustment | Reason |
|---|---|---|---|
| 10.B | First | First, with **expanded primitive list** (10 → 12: add `SpreadsheetView`, `DrillDownPanel`) | Themes 3 + 6 surfaced as platform-level, not role-level |
| 10.D Cleaner | Mid-stage | **High priority — schedule first or in parallel with 10.B** | Highest greenfield (no existing surface); blocks any field-ops adoption |
| 10.G CFO | Mid-stage | **After 10.B + Stage 9.I confirmed** | Drill-down depends on Stage 9.I aggregate-perf work + DrillDownPanel primitive |
| 10.E QS | Mid-stage | **Last among 10.C-10.K, or consider deferring some to 10.O** | PDF/DWG measurement is the riskiest novel UX; reference apps (CostX, Bluebeam) cost $$$ to match |
| 10.J Owner | Mid-stage | **Earlier — strong reference patterns, low-novelty UX** | AppFolio / Juniper Square set a clear bar; mostly assembly of existing data |
| 10.M Mobile | Stage 10 polish phase | **Concurrent with 10.D** | Cleaner phone flow IS the mobile-first proof; can't separate |

Recommended phase order (operator decides):

```
Week 1     : 10.A research (this doc)                    [BLOCKING] ← current
Week 2     : 10.B Design System (12 primitives)
Week 3     : 10.B continues (testing) + 10.D Cleaner kickoff (mobile-first)
Week 4-5   : 10.C Bookkeeper + 10.J Owner (parallel, both well-scoped)
Week 6-7   : 10.G CFO + 10.I Marketing
Week 8     : 10.K Front Office (depends on themes 4 + 7 from 10.B)
Week 9     : 10.F Project Manager (Gantt + site report)
Week 10    : 10.H Procurement (RFQ matrix)
Week 11    : 10.E QS (riskiest; deferred to last role phase)
Week 12    : 10.L AI cross-integration + 10.M mobile polish + 10.N acceptance
```

If interviews surface a different priority (e.g. operator's own customers ranking owner > cleaner), reorder accordingly. **The week-1 BLOCKING gate is shipping 22+ interview synthesis docs — not picking the order.**

---

## Stage 10.B Design System primitive list (revised)

Plan as-written specifies 10. Research suggests 12:

| # | Primitive | Consumed by | Source patterns |
|---|---|---|---|
| 1 | `SpreadsheetView` | 10.C, 10.E, 10.H | QuickBooks/Xero rapid entry, BoQ table, RFQ matrix |
| 2 | `MobileTaskCard` | 10.D, warehouse, 10.K | Properly/Breezeway/Turno checklists |
| 3 | `DrawingViewer` | 10.E | Bluebeam/CostX overlay measurement |
| 4 | `KanbanBoard` | 10.I, marketing/sales/procurement queue | HubSpot/Pipedrive/Trello |
| 5 | `DashboardKPI` | 10.G, 10.J, ops cockpit | Mosaic/Cube/Fathom traffic-light cards |
| 6 | `Timeline` | 10.F, 10.K, 10.J | Procore Gantt, Mews journey timeline |
| 7 | `RFQMatrix` | 10.H, QS bid-comparison | Coupa/Procurify matrix |
| 8 | `PhotoCapture` | 10.D, 10.F site reports, warehouse receive | Properly photo-required, Procore daily logs |
| 9 | `VoiceNote` | 10.D, 10.F, future field roles | Procore voice memo, Properly damage notes |
| 10 | `GeoCheckIn` | 10.D, 10.F site reports | Procore site-anchor, Hostaway property GPS |
| 11 | **`DrillDownPanel`** *(added)* | 10.G, 10.J, 10.C reconciliation, 10.E BoQ | CFO drill-down universal pattern |
| 12 | **`UnifiedInbox`** *(added)* | 10.I, 10.K, vendor comms | HubSpot threads, Mews unified inbox |

Each primitive ships with: TS types, story file (existing dev-storybook?), ≥2 tests, 1 dark-mode + 1 mobile screenshot.

---

## Scope cuts (don't ship in Stage 10)

Surfaced by reference-app research as commonly-built but high-cost / low-leverage for Arconique today:

1. **AI photo-classification for cleaner checklists** ("is this clean enough?") — Stage 11 candidate; cleaner brief acceptance does not require it
2. **BIM / 3D model takeoff for QS** — Stage 11+; PDF + raster overlays sufficient for villa scale
3. **Auto-generated investor MD&A narrative** — Stage 11 AI candidate
4. **Smart-lock hardware integration for front-office** — Stage 11+; manual key handoff acceptable
5. **Vendor self-service portal for procurement** — Stage 11+; ops-team-mediated RFQ acceptable
6. **Predictive issue alerting via AI** — defer; descriptive dashboards first, prescriptive later
7. **Cross-org / multi-portfolio aggregation** — Stage 12+; single-org sufficient through Stage 10
8. **Custom barcode label printing for warehouse** — backlog
9. **Multilingual auto-translation in inbox** — Stage 11
10. **Programmatic ad-spend optimization** — Stage 11+

Each item should land in a "parking lot" issue queue, not be silently forgotten.

---

## Open risks

1. **Interview velocity** — 22-33 interviews in 1 week is aggressive. If only 12 land, the briefs reflect operator interpretation more than role-holder voice. Mitigation: ship 10.B with the highest-confidence primitives (Kanban, Timeline, MobileTaskCard, DrillDownPanel) which surfaced from reference apps even before interviews; let lower-confidence primitives wait.
2. **QS reference-app gap** — CostX is $4-12k/seat-year. Even a "good enough" Arconique drawing-takeoff tool may be evaluated against that bar. Recommend prototype testing in 10.E with 2 working QS practitioners before committing engineering scope.
3. **Cleaner adoption assumes BYOD or company phones** — open question per cleaner brief. If cleaners are issued feature phones (not smartphones) the entire 10.D phase needs re-scoping (SMS / IVR fallback).
4. **Owner portal regulatory ambiguity** — "institutional" vs. "small individual" investor mix changes compliance scope. Hard-block on engineering 10.J until interview synthesis names the cohort.

---

## Phase 10.A acceptance — assistant deliverables

| Deliverable | Path | Status |
|---|---|---|
| 11 reference-app catalogs | `docs/ux-research/reference-apps/*.md` | ✅ shipped |
| Interview guide | `docs/ux-research/interview-guide.md` | ✅ shipped |
| 11 role briefs (skeleton) | `docs/ux-research/briefs/*.md` | ✅ shipped |
| Executive summary | `docs/ux-research/research-summary.md` | ✅ shipped (this doc) |
| Directory structure + README | `docs/ux-research/README.md` | ✅ shipped |

**Operator deliverables (in flight):**
- 22-33 interview sessions across 11 roles
- 11 `interviews/{role}/synthesis.md` files
- Briefs updated with verbatim quotes, real timed friction, real refusal points
- Operator sign-off on phase order before 10.B starts

**Phase 10.A is BLOCKING — 10.B does not start until at least 6 of the 9 phase-driving roles (bookkeeper, cleaner, qs, project-manager, cfo, procurement, marketing, owner, front-office) have completed synthesis docs.**
