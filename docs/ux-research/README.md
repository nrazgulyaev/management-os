# Stage 10 — UX Research

Foundation for Stage 10 (Role-Specific UX Transformation, ~12 weeks).

## Purpose

Stage 10 ships role-specific UX flows: Bookkeeper rapid-entry, Cleaner mobile workflow, QS drawing-aware measurement, PM Gantt, CFO drill-down dashboards, Procurement RFQ matrix, Marketing Kanban, Owner confidence dashboard, Front Office journey timeline. None of those flows can be designed in the abstract — they must come from observed user behavior, ranked tasks, and concrete reference patterns.

This directory captures that research before any new code is written.

## Structure

```
docs/ux-research/
  README.md                                 ← you are here
  research-summary.md                       ← executive summary (cross-role themes + Stage 10 backlog)
  interview-guide.md                        ← reusable script for operator-conducted interviews
  reference-apps/
    bookkeeper.md                           ← QuickBooks / Xero / Wave catalog
    cleaner.md                              ← Properly / Breezeway / TurnoverBnB catalog
    qs.md                                   ← CostX / Bluebeam / Buildxact catalog
    project-manager.md                      ← Procore / Buildertrend / Asana catalog
    cfo.md                                  ← Mosaic / Cube / Fathom catalog
    procurement.md                          ← Coupa / Procurify / Tradogram catalog
    marketing.md                            ← HubSpot / Pipedrive / Trello catalog
    owner.md                                ← AppFolio Investor Manager / Juniper Square / IMS catalog
    front-office.md                         ← Cloudbeds / Mews / Hostfully catalog
    warehouse.md                            ← Sortly / Fishbowl / Cin7 catalog
    operations-manager.md                   ← Hostaway / Guesty / iGMS catalog
  interviews/
    {role}/
      session-{n}.md                        ← raw notes per interview
      synthesis.md                          ← per-role synthesis after 2-3 interviews
  briefs/
    bookkeeper.md                           ← Stage 10.C input
    cleaner.md                              ← Stage 10.D input
    qs.md                                   ← Stage 10.E input
    project-manager.md                      ← Stage 10.F input
    cfo.md                                  ← Stage 10.G input
    procurement.md                          ← Stage 10.H input
    marketing.md                            ← Stage 10.I input
    owner.md                                ← Stage 10.J input
    front-office.md                         ← Stage 10.K input
    warehouse.md                            ← (Stage 10 backlog)
    operations-manager.md                   ← (Stage 10 backlog)
```

## Process

1. **Reference-app analysis** (assistant-led, 2-3 days) — for each role, document 3 best-in-class apps. Capture the 3 patterns that map to the role's biggest daily friction (e.g. for cleaner: bottom-nav task list + photo-required completion + offline cache).
2. **Operator-led interviews** (operator-led, 3-5 days) — 2-3 sessions per role, recorded against `interview-guide.md`. Operator captures verbatim quotes + observed friction. Synthesizes into `interviews/{role}/synthesis.md`.
3. **Briefs** (assistant + operator, 2 days) — fold reference patterns + interview synthesis into a `briefs/{role}.md` ready to consume by Stage 10.B-N. Each brief includes: top-3 daily tasks, current friction (timed), proposed flow, 5-7 acceptance criteria, anti-patterns to avoid.
4. **Executive summary** (assistant, 0.5 day) — `research-summary.md` rolls everything up: cross-role themes, Stage 10 phase ordering rationale, pruned scope, parking-lot.

## Acceptance — Phase 10.A done when

- [ ] 11 reference-app catalogs ✓ shipped (assistant deliverable)
- [ ] interview-guide.md ✓ shipped (assistant deliverable)
- [ ] 11 brief skeletons ✓ shipped (assistant deliverable; operator fills gaps from interviews)
- [ ] research-summary.md ✓ shipped (assistant deliverable)
- [ ] **At least 6 of 11 roles** have completed `interviews/{role}/synthesis.md` (operator deliverable — 22-33 sessions total across all roles)
- [ ] At least the 9 Stage 10 phase-driving briefs are ready: bookkeeper, cleaner, qs, project-manager, cfo, procurement, marketing, owner, front-office

The remaining 2 roles (warehouse, operations-manager) feed Stage 10 backlog phases — synthesis can lag.

## Stage 10 phase mapping

| Stage 10 phase | Role brief that feeds it |
|---|---|
| 10.C Bookkeeper Rapid-Entry | `briefs/bookkeeper.md` |
| 10.D Cleaner Mobile Workflow | `briefs/cleaner.md` |
| 10.E QS Drawing-Aware Measurement | `briefs/qs.md` |
| 10.F Project Manager Gantt | `briefs/project-manager.md` |
| 10.G CFO Drill-Down Dashboards | `briefs/cfo.md` |
| 10.H Procurement RFQ Matrix | `briefs/procurement.md` |
| 10.I Marketing Kanban Funnel | `briefs/marketing.md` |
| 10.J Owner Confidence Dashboard | `briefs/owner.md` |
| 10.K Front Office Journey Timeline | `briefs/front-office.md` |
| (backlog) | `briefs/warehouse.md`, `briefs/operations-manager.md` |
