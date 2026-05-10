# 01 — Mgmt OS / Maintenance intelligence / Plans

This file contains 1 sample report demonstrating the format. CHECKPOINT
2 will populate the remaining Maintenance Intelligence sub-pages
(`/dashboard/maintenance-intelligence/templates`,
`/dashboard/maintenance-intelligence/risk-feed`,
`/dashboard/maintenance-intelligence/plans/[id]`,
`/dashboard/maintenance-intelligence/plans/new`).

---

## `/dashboard/maintenance-intelligence/plans`

**Status**: 🟡 Half-built (page renders; "Generate due tasks" hits a server error per operator)
**Severity**: P0 (the headline action on this page is broken)
**Source files**:
- Page: `src/app/(dashboard)/dashboard/maintenance-intelligence/plans/page.tsx`
- Button: `src/components/maintenance-intelligence/generate-due-button.tsx`
- Action: `src/features/maintenance-intelligence/actions.ts:463 generateDueMaintenanceTasksAction`

### Production navigation signal
- HTTP status: `200`
- Console errors: `0`
- Network errors: `0`
- Has H1 / Main / Table / Form: `yes / yes / yes / no`
- CTA buttons detected: `+ New plan`, `Generate due tasks`
- Verdict from prior run: **`USABLE (200)`** ← **harness false negative**
  (page loaded, but the harness never clicked "Generate due tasks";
  the operator did and got a server error)

### Layout signal
- Uses Stage 10.D primitives: none
- Uses legacy patterns: `<PageHeader>`, custom `<table>`, inline action buttons
- Mobile responsive: partial (table-first)

### Functionality signal
- **Add (`+ New plan`)**: navigates to `/plans/new` (Modal-First Add gap)
- **Edit per row**: production check needed (likely full-page route)
- **Generate due tasks (headline action)**: 🔴 **SERVER ERROR per operator**
  - File analysis of the action (`actions.ts:463-497`) shows the
    server action looks structurally well-formed:
    - calls `requirePermission("maintenance_intelligence.generate")`
    - selects active plans whose `next_due_at <= now`
    - loops + calls `generateTaskFromPlan` per plan
    - records audit event + revalidates paths
    - returns `{ ok: true, generated }`
  - The error is therefore RUNTIME, not structural. Likely root causes
    (need production reproduction at CHECKPOINT 2):
    1. **Permission denied** — the operator's role lacks
       `maintenance_intelligence.generate`. The action throws a
       redirect or a 403 from `requirePermission()`, surfaced as
       "server error" in the inline error toast.
    2. **`generateTaskFromPlan` runtime error** — likely a schema
       mismatch (e.g., `operationTasks.daily_counter` requires a value
       but `nextDailyCounter()` is missing context).
    3. **Timeout** — too many overdue plans + serial loop.
- **Cancel button (in modal)**: N/A (no modal)
- **Form validation**: N/A

### Demo data signal
- Quantity: production check needed
- Realism: realistic if templates seeded
- Cross-references: plans → templates, villas, operation_tasks

### UI/UX vs reference screenshots
- Matches modern vibe: **No** (legacy table; no KPI hero)
- Big numbers: no
- Status pills: yes (status badges)
- Modern card layout: no
- **Gap**: candidate for the cabinet-dashboard pattern — top-of-page
  KPIs (overdue count, due-this-week count, generated-today count) +
  a per-villa card grid with the next-due tag.

### Integrations
- External services: none direct (could be wired to a calendar feed
  in the future)

### Bugs found
- **Bug 1** (P0): "Generate due tasks" returns server error.
  Reproduction: visit page → click button → `info` state never
  populates, `error` toast appears. Root cause unknown without
  production reproduction (3 hypotheses above).

### Operator-flagged behaviors
> "/dashboard/maintenance/plans — 'Generate new tasks' → SERVER ERROR"

- Reproduced in the operator's manual walk; needs production-side
  reproduction at CHECKPOINT 2 with the audit-bot account to capture
  the exact error message + network trace.

### Recommended action for Phase 10.6.B-F
- **Priority**: P0 (headline action broken)
- **Target sub-phase**: 10.6.B (critical fixes)
- **Effort estimate**: ~4h (production reproduction + root-cause +
  fix + regression test)
- **Dependencies**: needs production reproduction with operator
  credentials to confirm root cause before fix
- **Carry-over candidate**: no

### Screenshots
- Production state: needs CHECKPOINT 2 capture (specifically a
  reproduction with the network trace at "Generate due tasks" click)
- Reference comparison: n/a (functional bug, not design)
