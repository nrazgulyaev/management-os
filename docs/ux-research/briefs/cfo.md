# CFO brief — Stage 10.G

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.G CFO Drill-Down Dashboards
**Existing surfaces (codebase):**
- `/development-os/profitability` — P&L
- `/development-os/cashflow-forecast`
- `/development-os/finance/budget`
- `/development-os/reports/budget-burn`, `/reports/cashflow-waterfall`, `/reports/cost-heatmap`, `/reports/s-curve`
- `/development-os/cabinets/cfo-accountant` — composite
- AI agent: `executive_business` (Tier 3), `tax_assistant` (Tier 3)
- Server actions: `src/lib/development/server/finance/*`

---

## 1. Who is this person?

- **Title variants:** CFO, finance director, financial controller (smaller orgs)
- **Tenure / skill profile:** 15+ years; CPA / ACCA; uses Power BI / Tableau / Mosaic / Excel
- **Device profile:** desktop primary, large monitor; phone for urgent inbox only
- **Working context:** office-based; reviews monthly + quarterly + ad-hoc when CEO/board asks
- **Volume:** 5-30 villas under management = 5-30 P&Ls. Reviews 1-2 hours/day average, 4-6 hours at month-end + board prep.
- **Reports to:** CEO / board. Reports to them: finance manager, accountants, bookkeepers.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Variance review** — budget vs. actual by villa, by category, by month — currently Excel rollups
2. **Cashflow forecast** — runway by entity, payment schedule, distribution timing — currently Excel
3. **Investor distribution waterfall** — verify carry / preferred returns / cash splits — currently Excel + accountant memo

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: existing dashboards show *summaries* but don't drill to source transaction. CFO has to ping bookkeeper to "show me what's in the 47k spike in maintenance" — wasting both their time.

## 4. Refusal points (hypothesis — verify in interviews)

- Dashboards without click-to-detail
- Numbers that don't tie to the GL (CFO will lose trust on first mismatch)
- "Beautiful charts" without exportable underlying data
- AI insights that can't be audited back to source

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/cfo.md` (TBD by background research):
- **Pattern A** — drill-down: every aggregate cell clicks to source transactions in a side panel (no page reload)
- **Pattern B** — variance traffic-light + delta annotation: %  +  $ + reason ("AC repair, villa A, July")
- **Pattern C** — scenario toggle: actual / budget / forecast as overlay layers on the same chart

Anti-patterns:
- Charts without data tables
- KPIs that update on a different cadence than the underlying ledger
- Forecasts that can't be branched into "what-if" scenarios

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Variance review (target: drill from KPI to receipt in ≤4 clicks)

```
/profitability → 
  Top KPIs: Net income, EBITDA, Margin %, vs. budget delta
  Below: villa × month grid with traffic-light cells (green within 5%, amber 5-15%, red >15%)
  Click cell → side panel: 
    Top contributors: top 5 vendors / categories with $ impact
    Click vendor → tx list → click tx → original receipt + bank match
```

### Flow 2: Cashflow forecast with scenario toggle

```
/cashflow-forecast → 
  Toggle: [Actual] [Forecast] [Budget] — overlay layers
  Today indicator
  Hover bar → breakdown popover: inflows / outflows / net
  Add scenario: "delay villa C completion +2mo" → re-projects → diff bar shown
```

### Flow 3: Distribution waterfall

```
/distributions → 
  Pick period
  Waterfall chart: gross profit → preferred returns → catchup → carry → LP distrib
  Click any bar → table of contributing transactions / commitments
  Generate distribution memo PDF (per LP)
```

## 7. Acceptance criteria (consumed by Stage 10.G)

- [ ] Every KPI on /profitability drills to source GL transactions in ≤4 clicks (no page reload)
- [ ] Variance traffic-lights render in ≤2 seconds for a 30-villa × 12-month grid (Stage 9.I optimizations honored)
- [ ] Cashflow forecast supports ≥3 scenario branches, each with a reason memo
- [ ] Distribution waterfall ties to the cent against a 5-villa, 8-LP test portfolio
- [ ] AI agent `executive_business` can answer "explain the maintenance spike" with linked transactions
- [ ] All dashboards export to xlsx with the underlying data, not just the chart

## 8. Out of scope for Stage 10

- Multi-entity consolidation (group-level holding co)
- Tax provision computation UI (existing `/finance/tax-reports` covers it)
- ESG / sustainability reporting (Stage 12+)
- Auto-narrative MD&A generation (Stage 11 candidate via AI agent)

## 9. Open questions

- Does the CFO want predictive alerting ("you're 80% likely to breach maintenance budget"), or only descriptive?
- How often does board prep require ad-hoc views vs. saved standards?
- What's the tolerance for AI-generated commentary in board materials?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/cfo.md`
- Interview synthesis: `docs/ux-research/interviews/cfo/synthesis.md` (pending — sample 2-3 CFOs)
