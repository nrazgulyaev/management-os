# Sprint 4 — Bookkeeper screenshot manifest

**Sprint:** 4 — Dev OS Bookkeeper: Google Sheets feel + AI + design
**Date opened:** 2026-05-13
**Commits in this sprint:**

```
77dee6c  feat(award): 5 new award primitives for Sprint 4 cabinet rebuild
880813c  feat(finance): Sheets-style quick-entry route + bulk server action
3c6541b  feat(finance): transaction import wizard (paste + XLSX) + import_templates
32f03c5  feat(cabinets): CFO apex rebuilt on Sprint-4 primitives + quick-entry CTAs
```

## What needs to be captured

| File | Surface | Viewport |
|---|---|---|
| `01-cfo-apex-light.png` | `/development-os/cabinets/cfo-accountant` light mode, signed in | 1440×900 (full scroll) |
| `02-cfo-apex-dark.png` | Same surface, dark mode (theme toggle) | 1440×900 |
| `03-quick-entry-light.png` | `/development-os/finance/transactions/quick-entry` with 3-4 demo rows entered | 1440×900 |
| `04-import-paste-light.png` | `/development-os/finance/transactions/import` Tab A with sample TSV pasted + preview rendered | 1440×900 |
| `05-import-upload-light.png` | Same surface, Tab B with a sample XLSX file loaded | 1440×900 |
| `06-import-sheets-placeholder.png` | Same surface, Tab C showing the Sprint 4.5 placeholder | 1440×900 |
| `07-hero-greeting-detail.png` | Close crop of the HeroGreetingAI hero card | 1200×400 |
| `08-todays-pulse-detail.png` | Close crop of HatchedBarChart + HalfDonutGauge row | 1440×500 |

## Manual recipe

The harness blocks auto-starting `npm run dev`. Operator runs:

```bash
# 1) Make sure Sprint 4 migration is applied.
npm run db:migrate

# 2) Seed demo data (optional — gives the cabinet KPIs + recent
#    transactions feed real-looking content for the screenshots).
npm run db:seed

# 3) Start the dev server.
npm run dev

# 4) Sign in OR set NEXT_PUBLIC_ENABLE_DEMO_MODE=1 in .env.local for
#    demo mode (skips auth, lets the cabinet render with mock data).

# 5) Capture screenshots via the browser's full-page screenshot
#    feature (Chrome DevTools → ⌘⇧P → "Capture full size screenshot")
#    or via Playwright:
#
#    npx playwright screenshot --viewport-size=1440,900 \
#      http://localhost:3000/development-os/cabinets/cfo-accountant \
#      docs/screenshots/2026-05-13-sprint-4-bookkeeper/01-cfo-apex-light.png

# 6) For the Tab A / Tab B import previews, paste this sample TSV
#    into the textarea (saved here for reproducibility):
```

### Sample TSV for paste preview

```
Date	Type	USD	Category	Description	Vendor
2026-04-12	Expense	1250	Construction	Cement delivery — 50 bags	BaliBricks
2026-04-13	Income	8500	Sale income	Down payment unit ES-S2	Mr. Tanaka
2026-04-14	Expense	340	Operating expense	Diesel for site generator	PERTAMINA
2026-04-15	Expense	2100	Construction	Electrical conduit + cable	ElektroNusa
```

Paste → "Parse + preview" → screenshot the parsed table including
the auto-mapped headers caption ("Auto-mapped 6 headers · 4 rows
parsed").

## What the screenshots should illustrate

### `01-cfo-apex-light.png` (full scroll)

Top → bottom:

1. **HeroGreetingAI hero card** — date chip on the left, role pill
   ("CFO / Accountant · Cabinet"), greeting "Hey, {firstName}, need
   help? 👋" with the prompt input + mic affordance on the right
2. **Quick-action strip** — three tiles linking to quick-entry,
   import, and AI Tax Assistant (caption surfaces latest output
   code)
3. **4-up hero KPI grid** (Sprint 1) — ink-deep cash-on-hand hero
   with sparkline + 3 status-coded KPIs each with their own
   sparkline
4. **30/60/90 cashflow forecast** — 3 small KPIs with sparklines
5. **Bookkeeper workload** — 3 small status KPIs
6. **AI Insights** — 2-up cards for tax-assistant + qs-cost-analyst
   latest outputs
7. **Recent transactions** aside on the right rail
8. **Today's pulse (Sprint 4 NEW)** — HatchedBarChart (7 days) +
   HalfDonutGauge (review queue cleared %, gold tone)

### `03-quick-entry-light.png`

- Top: bank account picker (select) + "Tab/Enter…" caption
- Middle: SpreadsheetView grid with 9 columns and 3-4 rows partially
  filled in
- Below: the empty results panel (no save yet) — OR after Ctrl-S,
  the "N of N rows saved" success panel

### `04-import-paste-light.png`

- Tab nav at top (Paste · Upload CSV/XLSX · Google Sheets live)
- Paste textarea filled with the sample TSV above
- "Parse + preview" button highlighted; below it the parsed table
  showing 4 rows with the date/direction/amountMajor/category/
  description/vendor columns auto-filled, and any warnings (e.g.
  "Direction 'Expense' not 'inflow' or 'outflow'") flagged in the
  Warnings column.

## When the screenshots land

Update `docs/audits/2026-05-13-sprint-4-closure.md` §Visual self-
assessment to attach the captured images inline. Until that
update, the closure doc's text-only self-assessment is the
canonical Sprint 4 visual record.
