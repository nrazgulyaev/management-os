# CFO reference apps

Role context: CFO of a Bali villa portfolio + development holding co. Wants drill-down dashboards: P&L by villa, cashflow runway, budget vs. actual variance, investor distributions waterfall. Desktop-only. Reviews monthly + ad-hoc.

## Mosaic

### Positioning

Mosaic is a strategic-finance platform built for venture-backed CFOs who have outgrown spreadsheets but are not ready for Anaplan. It is known for real-time consolidation across ERP / CRM / HRIS / billing systems, live dashboards (the "Mosaic Canvas"), and full transaction-level drill-down — you can click a number on a P&L and land on the underlying journal entry without exporting to Excel.

### Top 3 patterns

- **Click-through drill from KPI to journal entry.** A CFO clicks a "Revenue" tile on a dashboard, drills into revenue by villa, then by booking source, then onto the individual GL transactions that make up the balance. The path is breadcrumbed and reversible. For Arconique this maps directly to "click villa NOI -> villa P&L -> month -> bill / invoice."
- **Metric Builder — composable formulas referencing accounts + drivers.** A custom KPI like "RevPAR by villa" or "Cash-on-cash by investor cohort" is built once as a formula referencing GL accounts, headcount drivers, and other KPIs. It then powers any dashboard, report, or alert without re-coding. This is how Arconique should expose investor-distribution math.
- **Variance commentary attached to the cell, not a separate doc.** Every variance vs. budget gets a comment thread on the row itself; the explanation lives where the number lives. When the board asks "why was Villa 7 maintenance over budget in March?", the answer is one click away, not in a Slack thread from 6 weeks ago.

### Pricing

$$$ — quote-only; typically lands in the $30-80k+/year range based on data sources, entity count, and seat count. No public pricing.

### Why useful for Arconique

Mosaic is the cleanest reference for the *drill-down spine* a villa CFO needs: consolidated dashboard at the top, journal entry at the bottom, breadcrumb in between. Steal the click-through pattern, the metric builder, and inline variance commentary.

## Cube

### Positioning

Cube is an FP&A platform built around the insight that finance teams will never fully leave Excel and Google Sheets. It is known for bi-directional spreadsheet sync — the CFO models in Sheets, Cube pushes the data to a governed cube and pulls it back into the same workbook live. The platform layers on multi-scenario planning, audit trails, and rollups without forcing migration off the spreadsheet.

### Top 3 patterns

- **Bi-directional Excel / Google Sheets sync via formulas.** A CFO writes `=GETCUBEDATA("Revenue", "Villa Seminyak", "2026-Q1")` in their existing financial model; the value is live, governed, and traceable to the source ERP. Edits in approved cells push back to the cube. Arconique should do this for villa-level operating data so the CFO never re-keys.
- **Multi-scenario side-by-side ("base / bull / bear") with one-click swap.** Build a base plan, clone to a bear scenario, change 4 assumptions (occupancy down 15%, USD/IDR weaker, opex flat), and see the downstream cashflow and runway delta in the same view. Switching the dashboard between scenarios is one dropdown — critical for villa-portfolio sensitivity work.
- **Driver-based planning with assumption traceability.** Change one assumption (e.g., average daily rate per villa) and see exactly which downstream cells in P&L, cashflow, and investor waterfall update, with a visible dependency graph. No more "I changed something and the model broke."

### Pricing

$$ to $$$ — quote-only; published starting tier historically $1.5-2k/mo, mid-market deployments commonly $25-60k/year.

### Why useful for Arconique

Cube is the reference for the "CFOs will use Excel — meet them there" stance. Arconique should ship a Sheets / Excel formula bridge and a clean scenario-toggle pattern, even if the primary UI is a web dashboard.

## Fathom

### Positioning

Fathom is a management-reporting and KPI-tracking tool built on top of QuickBooks / Xero / MYOB. It is known for turning monthly accounting data into beautiful, board-ready PDF reports and dashboards with minimal setup — the bookkeeping firm's favorite client-deliverable tool. Less powerful than Mosaic or Cube on planning, but unmatched on *presenting* monthly numbers.

### Top 3 patterns

- **KPI Builder with 50+ pre-built financial KPIs + custom formulas.** A CFO picks "Gross margin," "Cash conversion cycle," "DSO" from a library, or builds a custom "Revenue per villa-night." Each KPI has a target, a traffic-light threshold, and a sparkline trend — exactly the shape Arconique needs for per-villa scorecards.
- **Scheduled, branded report packs (PDF + web link).** Monthly investor-update packs are designed once, then auto-generated and emailed on the 5th of each month with the previous month's data, branded charts, and CFO commentary blocks. For a holding co reporting to villa investors, this is a complete out-of-box solution to what is otherwise a 2-day manual job.
- **Visual variance grid: budget vs. actual with traffic-light cells.** A grid where each cell is colored by variance band (green ±5%, amber ±10%, red >10%), with the magnitude shown numerically. The eye finds the problem in 2 seconds. Arconique should use this exact pattern on the per-villa P&L.

### Pricing

$ to $$ — published tiers; small-business pricing starts around $44/mo, scales by entity count. Pay-as-you-go monthly, no annual lock-in.

### Why useful for Arconique

Fathom is the reference for the *output* layer — investor-ready monthly packs, KPI scorecards, and the visual-variance grid. Steal the report-pack scheduler and the traffic-light variance cells.

## Top 3 cross-app patterns to adopt

1. **Drill from dashboard tile to underlying transaction in 3 clicks max.** Dashboard -> entity (villa) -> period -> transaction list. Breadcrumb visible at every level. This is the single pattern that distinguishes a real finance tool from a static report.
2. **Composable metric / KPI definitions stored once, surfaced everywhere.** Define "NOI per villa" or "Investor IRR" in a formula library; reuse across dashboards, reports, alerts, and exports. No copy-pasting formulas across views.
3. **Scenario toggle as first-class UI.** Every dashboard and every model should have a scenario dropdown (base / bull / bear / custom). Switching is instant and visually obvious — a colored banner so nobody mistakes a stress-test number for actuals.

## Anti-patterns to avoid

- **Static PDFs as the primary output.** Fathom's report packs are great as a *complement*, but a CFO needs an interactive dashboard where they can re-slice on the fly. Don't ship reports without the live drill-down underneath.
- **"One giant table" dashboards.** Mosaic and Cube both have demos that overwhelm with 40-column tables. The CFO's first view should be 6-9 KPI tiles + 2 charts; depth is one click away.
- **Hidden formula logic.** Custom KPIs whose math you cannot inspect erode trust within a quarter. Every metric must show its formula and its source accounts on hover.
- **Forcing the CFO out of Excel for ad-hoc analysis.** Even with the best web UI, ad-hoc sensitivity work happens in Sheets. A CSV / live-formula export must be one click — not a support ticket.
- **Refresh latency that hides as "real time."** If actuals are 24h stale because of an overnight ERP sync, say so explicitly with a "last synced" timestamp on every tile. Silently stale data destroys CFO trust faster than any other failure mode.
