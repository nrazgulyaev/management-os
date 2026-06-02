# Task — Phase 2.2 PR 6 — Dev · CFO/Finance

**Reference doc:** `_handoff/cabinets/dev-p1/cfo.html`

## Files

ROUTES:
- `src/app/(development-app)/development-os/cfo/page.tsx` — REFACTOR (exists from 2.1) — becomes consolidated console
- `src/app/(development-app)/development-os/cfo/cashflow/page.tsx` — new 12mo rolling forecast
- `src/app/(development-app)/development-os/cfo/capital-calls/page.tsx` — new list
- `src/app/(development-app)/development-os/cfo/capital-calls/[id]/page.tsx` — new detail
- `src/app/(development-app)/development-os/cfo/distributions/page.tsx` — STUB ("Coming Q3 2026" placeholder; deferred to 2.4)

PRIMITIVES:
- `src/components/cfo/waterfall-chart.tsx` — bar-row visualization (commitments → called → 5 capex categories → reserved → cash on hand). Static rows + inline bar widths.
- `src/components/cfo/capital-call-card.tsx` — pct paid + progress bar
- `src/components/cfo/cashflow-forecast.tsx` — sparkline + per-month breakdown

SCHEMA:
- `capital_calls` — new (FK project_id, ref, issued_at, total_usd, status "drafting|issued|partial|received")
- `capital_call_allocations` — new (FK call_id, investor_id, allocated_usd, received_at?, ref?)
- `cashflow_forecasts` — materialized view, refreshed by cashflow-forecaster agent
- Existing: `investors`

MODALS:
- `src/components/cfo/new-capital-call-modal.tsx` — form-lg 3 steps (amount · investors · timing)
- `src/components/cfo/record-capital-received-modal.tsx` — form-md (wire ref + date)

AGENTS:
- `src/features/ai-agents/cashflow-forecaster/` — daily, refreshes 12mo forecast
- `src/features/ai-agents/capital-call-drafter/` — event-triggered when project cash < 14d runway

## Validation

- Waterfall renders with correct row colors (capital in = accent, outflows = ink-2, reserved = dashed, net = ok)
- Capital-call list shows partial-receipt tracking (e.g. "9 of 12 investors paid · 75%")
- Cashflow forecast page renders sparkline + per-month detail
- Distributions route returns 404-style "Coming Q3" placeholder

## Commit

`phase-2.2(dev-cfo): consolidated console + waterfall + capital-calls list/detail + cashflow forecast + 2 modals + 2 agents`
