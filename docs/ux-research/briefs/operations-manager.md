# Operations Manager brief — Stage 10 backlog

**Status:** draft (interviews pending) — Stage 10 backlog (not in 10.C–10.K phase set)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** (none directly; cross-cuts 10.D Cleaner + 10.K Front Office; surfaces consumed by 10.N polish phase)
**Existing surfaces (codebase):**
- `/development-os/cabinets/my-cabinet` — generic landing
- `/development-os/dashboard` — operator dashboard
- `/development-os/operations`, `/operations/site-reports`
- `/development-os/risk-radar`, `/development-os/safety`, `/development-os/qa-qc`
- Cross-functional: views into all roles
- Existing role: `operations_manager`, `property_manager`, `director`

---

## 1. Who is this person?

- **Title variants:** Operations Manager, GM, Property Manager (medium orgs), Portfolio Manager
- **Tenure / skill profile:** 10-20 years; cross-functional; final-decision-maker for non-finance issues
- **Device profile:** desktop primary, phone for after-hours + travel
- **Working context:** office; daily ops review + escalation triage; weekly portfolio review
- **Volume:** 5-30 villas under management; reviews 2-4 hours/day average; escalation as-needed
- **Reports to:** director / CEO. Manages: PMs, front office, housekeeping leads, procurement.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Day-of dashboard review** — arrivals, departures, turnovers, urgent issues — currently scattered
2. **Escalation triage** — guest complaints, vendor failures, urgent maintenance
3. **Weekly portfolio review** — KPI check by villa, channel performance, cost trends

## 3. Friction (hypothesis)

Pattern hypothesis: existing dashboard is link-list-shaped (cabinets per role). Ops manager needs a **portfolio cockpit** — multi-property at-a-glance with status pills, drill-down per property.

## 4. Refusal points (hypothesis)

- Per-channel inboxes (need unified, like front-office Pattern A)
- KPI-tile dashboard as home (Hostaway anti-pattern; need event-anchored, not date-anchored)
- Tasks that don't roll up to portfolio level
- Exception alerts that fire too often (cry-wolf)

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/operations-manager.md` (research complete):
- **Pattern A** (Hostaway) — multi-calendar cockpit as home screen
- **Pattern B** (Guesty) — lifecycle-event-driven auto-tasks (reservation event triggers ops task)
- **Pattern C** (iGMS / Hostaway) — cleanliness as first-class property status (not derived)

## 6. Proposed flow (sketch — defer to backlog phase)

Existing `/cabinets/my-cabinet` should become the ops-manager cockpit landing if they have the operations_manager role. Will detail when scheduled.

## 7. Acceptance criteria (placeholder)

To be defined.

## 8. Out of scope for Stage 10

- Multi-org / multi-portfolio aggregation (single-org for now)
- Workforce optimization across roles
- Predictive issue alerting via AI

## 9. Open questions

- Is the ops manager the right escalation point for guest complaints, or front-office?
- How much do they want auto-resolution suggestions vs. "show me, I'll decide"?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/operations-manager.md`
- Interview synthesis: `docs/ux-research/interviews/operations-manager/synthesis.md` (pending — 2-3 sessions when scheduled)
