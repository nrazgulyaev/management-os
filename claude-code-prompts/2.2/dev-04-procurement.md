# Task — Phase 2.2 PR 8 — Dev · Procurement + Vendors

**Reference doc:** `_handoff/cabinets/dev-p1/procurement.html`

## Files

ROUTES:
- `src/app/(development-app)/development-os/cabinets/procurement-manager/page.tsx` — REFACTOR (exists from 2.1)
- `src/app/(development-app)/development-os/cabinets/procurement-manager/rfqs/[id]/page.tsx` — new quote comparison
- `src/app/(development-app)/development-os/cabinets/procurement-manager/pos/page.tsx` — new PO list
- `src/app/(development-app)/development-os/cabinets/procurement-manager/pos/[id]/page.tsx` — new PO detail
- `src/app/(development-app)/development-os/vendors/page.tsx` — new directory
- `src/app/(development-app)/development-os/vendors/[id]/page.tsx` — new scorecard detail (Overview / POs / Quotes / Documents / Activity tabs)

PRIMITIVES:
- `src/components/procurement/rfq-status-pill.tsx` — 5 states (draft/sent/quoting/awarded/closed)
- `src/components/procurement/quote-compare.tsx` — 3-column grid, winner-tinted column
- `src/components/procurement/vendor-score.tsx` — numeric badge with tone (high>=85 / mid 65-84 / low<65)
- `src/components/procurement/vendor-card.tsx` — directory list-row
- `src/components/procurement/agent-recommend-banner.tsx` — green vendor-matcher hint strip below quote compare

FEATURES:
- `src/features/vendors/scoring.ts` — composite weights (price 40% · delivery 30% · quality 20% · responsiveness 10%). Formula documented in this file.

SCHEMA:
- `vendor_scores` — new (FK vendor_id, score_composite, 4 component scores, computed_at)
- `quotes` — new (FK rfq_id, vendor_id, total, lead_time, warranty, submitted_at, raw_pdf_url)
- `quote_lines` — new (FK quote_id, boq_line_ref?, description, qty, unit, rate)
- Existing: `vendors`, `vendor_categories`, `rfqs`, `rfq_vendor_invites`, `purchase_orders`, `po_deliveries`

MODALS:
- `src/components/procurement/new-rfq-modal.tsx` — form-lg 3 steps (scope · vendors · deadline)
- `src/components/procurement/add-quote-modal.tsx` — form-md (PDF upload + parsed preview from quote-parser agent)
- `src/components/procurement/award-po-modal.tsx` — confirm (winner + reason field, auto-creates PO)
- `src/components/procurement/register-vendor-modal.tsx` — form-md (contact + category + tax docs)

AGENTS:
- `src/features/ai-agents/vendor-matcher/` — suggests vendors at RFQ-create time + ranks at award time
- `src/features/ai-agents/quote-parser/` — LLM-extracts line totals from PDF quotes (uses Claude infra)
- `src/features/ai-agents/vendor-score-updater/` — nightly cron

## Validation

- RFQ list status pills correct (5 states with tinting)
- Quote comparison: 3-vendor grid with winner column tinted ok-green
- Vendor-matcher banner appears below comparison with "Award to X — saves $N" recommendation
- Vendor scorecard composite computed correctly from 4 components

## Commit

`phase-2.2(dev-procurement): RFQ list + 3-vendor quote compare + vendor scorecard + 4 modals + 3 agents + scoring model`
