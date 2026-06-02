# Task — Phase 2.2 PR 5 — Dev · Projects + PM

**Reference doc:** `_handoff/cabinets/dev-p1/projects.html`

## Files

ROUTES:
- `src/app/(development-app)/development-os/projects/page.tsx` — new list
- `src/app/(development-app)/development-os/projects/[id]/page.tsx` — new detail
- `src/app/(development-app)/development-os/projects/[id]/milestones/page.tsx` — new editor (flat list with dependency indicator)
- `src/app/(development-app)/development-os/cabinets/project-manager/page.tsx` — REFACTOR (exists from 2.1) — becomes "PM personal queue" (cross-project)

PRIMITIVES:
- `src/components/projects/project-card.tsx` — list-row card (grid layout, not table)
- `src/components/projects/health-pill.tsx` — `<HealthPill level="green"|"amber"|"red" reason? />`
- `src/components/projects/progress-bar.tsx` — value + pct + label
- `src/components/projects/num-kpi.tsx` — compact inline number+label combo
- `src/components/projects/milestone-row.tsx` — used in editor + Overview-tab panel

FEATURES:
- `src/features/projects/health.ts` — `computeHealth(project): { schedule, budget, overall }`. Aggregates milestones (schedule) + BOQ totals (budget). Cached daily.

SCHEMA:
- `projects` — new (id, code, name, type "new-build|retrofit|amenity", status, target_completion, total_budget, pm_user_id)
- `milestones` — new (FK project_id, name, target_date, actual_date?, status, owner_staff_id)
- `milestone_dependencies` — new (from/to milestone_id, kind "finish-to-start|start-to-start")
- `rfis` — new (FK project_id, ref, question, discipline, routed_to_contact_id, opened_at, resolved_at?)

MODALS:
- `src/components/projects/new-project-modal.tsx` — form-lg 4 steps (Identity → Site → Phasing → Team)
- `src/components/projects/add-milestone-modal.tsx` — form-md with dependency picker
- `src/components/projects/assign-pm-modal.tsx` — form-sm
- `src/components/projects/rfi-compose-modal.tsx` — form-md, routes via rfi-router

AGENTS:
- `src/features/ai-agents/schedule-variance-detector/` — daily 05:30
- `src/features/ai-agents/rfi-router/` — routes RFI to discipline (arch/struct/MEP)
- `src/features/ai-agents/weekly-report-composer/` — drafts Friday investor update

## Validation

- Project card list renders correctly with progress bar + health pill
- Detail page Overview tab shows 4 KPIs + upcoming-milestones panel + open-RFIs panel + side panel (PM, contractors, investors)
- BOQ tab + Procurement tab on detail are **external links** (open BOQ cabinet pre-filtered by project_id), not embedded
- Milestone editor: drag-to-reorder + status enum + dependency picker
- Schedule health derives correctly: Green ≤7d slip · Amber 7-21d · Red >21d

## Commit

`phase-2.2(dev-projects): list + 6-tab detail + milestones editor + 4 modals + 3 agents + health derivation`
