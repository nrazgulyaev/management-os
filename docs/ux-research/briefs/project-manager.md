# Project Manager brief — Stage 10.F

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.F Project Manager Gantt
**Existing surfaces (codebase):**
- `/development-os/projects`, `/development-os/projects/[slug]`
- `/development-os/project-cycle` — phase tracking
- `/development-os/schedule` — calendars
- `/development-os/schedule/calendars`, `/development-os/schedule/resources`
- `/development-os/cabinets/project-manager` — composite landing
- `/development-os/cabinets/site-supervisor` — field-side complement
- `/development-os/risk-radar`, `/development-os/safety`, `/development-os/qa-qc` — issue tracking
- `/development-os/method-statements` — work approvals
- Server actions: `src/lib/development/server/projects/*`, `src/lib/development/server/schedule/*`

---

## 1. Who is this person?

- **Title variants:** Project Manager, Construction Manager, Site Manager (overlap with site-supervisor cabinet)
- **Tenure / skill profile:** 8-20 years construction; comfortable with Gantt charts; uses MS Project / Asana / Procore historically
- **Device profile:** hybrid — desktop in office (planning), tablet on-site (daily walks), phone (urgent comms)
- **Working context:** half-office half-site. Daily site walk in morning, office afternoon for paperwork.
- **Volume:** 20-100 active tasks across 3-10 vendors per project; 1-3 active projects
- **Reports to:** director / operations manager. Manages: site supervisors, vendors, QS.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Daily schedule check** — what's on critical path today, what slipped — currently mental + WhatsApp + spreadsheet
2. **Site updates capture** — photo + note per area, distribute to stakeholders — currently WhatsApp groups
3. **Issue / RFI / change-order management** — currently email + spreadsheet log

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: schedule lives in MS Project (offline file), site comms in WhatsApp, issues in email — three silos that don't talk. PM spends 2+ hours/day reconciling.

## 4. Refusal points (hypothesis — verify in interviews)

- Gantt that doesn't auto-cascade dependencies on a delay
- Schedules that can't be exported to MS Project / PDF for stakeholder reviews
- Mobile UI that crashes on photo-heavy site reports
- Tasks that lose vendor assignment on edit

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/project-manager.md` (TBD by background research):
- **Pattern A** — drag-to-resize Gantt bar with auto-cascade dependents (and a "preview impact" before commit)
- **Pattern B** — daily site report = photo grid + voice memo + auto-attach to task
- **Pattern C** — issue → RFI → change-order pipeline as a kanban with clear SLA timers

Anti-patterns:
- Gantt that recomputes on save without showing impact preview
- Site reports that require typing the project name (should be inferred)
- Issue logs that don't roll up to Gantt impact

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Daily Gantt with critical-path heatmap

```
/projects/[slug]/gantt → 
  Top: today indicator, week view default
  Bars: tasks colored by lane (foundation / structure / fitout / finishing)
  Critical path: red border on bars
  Slipped tasks: amber border
  Click bar → side panel: dependents + assigned vendor + last update
  Drag-resize → preview overlay: "moves 6 tasks, +3 days end date" → confirm
```

### Flow 2: Field site report (target: <90 sec for 5-photo update)

```
Tablet/phone:
  [+ Site report] floating button
  → defaults to active project + GPS-inferred area
  → Camera multi-shot (5 in row) → annotate one with finger
  → Voice memo (60s) → auto-transcribed (post-process)
  → Tap "send" → posts to project log + tagged tasks
```

### Flow 3: Issue / RFI / change-order kanban

```
/projects/[slug]/issues → swimlanes:
  [New] → [In review] → [Approved] → [Done]
With SLA: card border yellows at 48h, reds at 72h
Card → expand: linked drawings + photos + back-and-forth thread + decision
```

## 7. Acceptance criteria (consumed by Stage 10.F)

- [ ] PM can produce a 100-task project Gantt view in ≤30 seconds page-load (with critical-path)
- [ ] Drag-resize a task → preview shows cascade impact within 200 ms
- [ ] Daily site report (5 photos + memo) submitted in ≤90 seconds on tablet
- [ ] ≥95% of issues resolve before SLA red-line (after 60 days of usage)
- [ ] Schedule exports to MS Project XML (or competent alternative) without data loss
- [ ] PM stops using WhatsApp for project updates within 6 weeks (logged in interview follow-up)

## 8. Out of scope for Stage 10

- BIM / 3D model integration — Stage 11+
- Resource leveling / utilization optimization across projects — Stage 11+
- Cost-loaded schedule (S-curve already in `/reports/s-curve`) — read-only fine for now
- Vendor self-service (vendor logs in to update tasks) — separate stage

## 9. Open questions

- Do PMs treat the Gantt as the source of truth, or as a stakeholder-deliverable that they update reactively from spreadsheets?
- How are dependencies currently tracked? (predecessor/successor links rare in field — most schedules are date-only)
- Does the operator want the WhatsApp integration sunset or kept as an export channel?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/project-manager.md`
- Interview synthesis: `docs/ux-research/interviews/project-manager/synthesis.md` (pending — sample 3-5)
