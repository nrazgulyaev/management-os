# Task — Phase 2.2 PR 7 — Dev · BOQ + QS

**Reference doc:** `_handoff/cabinets/dev-p1/boq-qs.html`

The big-table cabinet. ~142 lines × 6 projects = ~850 rows total scrollable. Needs virtualization.

## New dep

`npm install @tanstack/react-virtual` (~5KB gzip)

## Files

ROUTES:
- `src/app/(development-app)/development-os/cabinets/qs/page.tsx` — REFACTOR (exists from 2.1) — becomes variance review queue
- `src/app/(development-app)/development-os/projects/[id]/boq/page.tsx` — new BOQ table with WP-tree
- `src/app/(development-app)/development-os/projects/[id]/boq/[lineId]/page.tsx` — new line detail (actuals history + related POs)
- `src/app/(development-app)/development-os/cabinets/qs/import/page.tsx` — new 3-step import wizard

PRIMITIVES:
- `src/components/boq/wp-tree.tsx` — left-rail nav, click to filter
- `src/components/boq/boq-table.tsx` — virtualized via `@tanstack/react-virtual`. Sticky header, cursor pagination from template 03.
- `src/components/boq/delta-pill.tsx` — `<DeltaPill value baseline kind />`. ok/warn/danger/neutral tones. Computes pct delta.
- `src/components/boq/variance-card.tsx` — QS workspace card (3-col grid: ref+pill / title+contractor-explanation+actions / num-grid)

FEATURES:
- `src/features/boq/variance.ts` — pure fn `computeVariance(line, actuals)`. Threshold: >5% on cost. Recomputed on every BOQ actuals write.

SCHEMA:
- `boq_revisions` — new (FK project_id, version, snapshot_at, replaces_id?)
- `boq_lines` — new (FK revision_id, code, description, wp_code, qty_planned, unit, rate_planned, line_total_planned, INDEX on (project_id, wp_code))
- `boq_actuals` — new (FK line_id, qty_actual, rate_actual, source_po_id, recorded_at — multi-row per line allowed for partial actuals)
- `variance_reviews` — new (FK line_id, flagged_at, kind, qs_decision "approve|reject|investigate", decision_at?, reason?)

MODALS:
- `src/components/boq/approve-variance-modal.tsx` — confirm (reason + impact + sign)
- `src/components/boq/reject-variance-modal.tsx` — destructive-ish (push back to PM)
- `src/components/boq/edit-boq-line-modal.tsx` — form-md (update planned qty/rate, audited)
- `src/components/boq/import-boq-modal.tsx` — form-lg 3-step wizard (upload → map → reconcile diff-view)

AGENTS:
- `src/features/ai-agents/variance-detector/` — hourly + on actuals write
- `src/features/ai-agents/cost-coder/` — LLM-assist invoice → BOQ line mapping
- `src/features/ai-agents/cost-anomaly-explainer/` — drafts variance reason text for QS

## Validation

- BOQ table renders 142+ rows smoothly via virtualization (no scroll jank)
- WP-tree filter works: click WP-04 → table shows only WP-04.\* lines
- Variance pills color correctly: <5% ok, 5-15% warn, >15% danger
- QS workspace: 4 actions per variance (Investigate / Reject / Approve / Request reason from contractor)
- Import wizard step 3: diff-view shows added=green, removed=red, changed=yellow with old→new

## Commit

`phase-2.2(dev-boq-qs): WP-tree + virtualized BOQ + variance review queue + import wizard + 4 modals + 3 agents + tanstack/react-virtual dep`
