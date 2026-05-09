# Stage 10.5.A — Award-winning per-cabinet dashboards · COMPLETE

**Date**: 2026-05-09
**Theme**: Replatform every cabinet onto a single award-winning layout
vocabulary (PageHeaderHero + status-coded DashboardKpi tiles +
2/3-1/3 split body), establish a documented pattern, and close the
gap left by Stage 10.J's renamed scope.

**Tests delivered across 10.5.A.1 + .2 + .3**: ~84 acceptance tests
**Test count progression**: 5480 → 5505 → 5539 → ~5580
**Migrations**: 0
**Cabinets shipped**: 10 (every cabinet on the system)
**Pattern doc**: `docs/stage-10-5-cabinet-dashboard-pattern.md`

---

## What "complete" means

Every cabinet listed in the system now lands on the unified pattern:

| # | Cabinet | Surface | Sub-phase |
|---|---|---|---|
| 1 | Owner | `/dashboard/owner` (Mgmt OS, NEW) | 10.5.A.1.1 |
| 2 | CFO / Accountant | `/development-os/cabinets/cfo-accountant` | 10.5.A.1.2 |
| 3 | Project Manager | `/development-os/cabinets/project-manager` | 10.5.A.1.3 |
| 4 | Site Supervisor | `/development-os/cabinets/site-supervisor` | 10.5.A.2.1 |
| 5 | QS / Cost Analyst | `/development-os/cabinets/qs` | 10.5.A.2.2 |
| 6 | Procurement Manager | `/development-os/cabinets/procurement-manager` | 10.5.A.2.3 |
| 7 | Marketing Staff | `/development-os/cabinets/marketing-staff` | 10.5.A.2.4 |
| 8 | Sales Manager | `/development-os/cabinets/sales-manager` | 10.5.A.3.1 |
| 9 | Warehouse Manager | `/development-os/cabinets/warehouse-manager` | 10.5.A.3.2 |
| 10 | Front Office | `/dashboard/front-office` (Mgmt OS) | 10.5.A.3.3 |

**Plus**: 8 thin redirect pages at `/dashboard/{role}` for every Dev
OS cabinet, so users typing the Mgmt OS URL pattern always land on
the canonical cabinet route (no more 404s on `/dashboard/project-manager`).

---

## The pattern (one-line summary)

```
<DevelopmentShell>          {/* Mgmt OS pages omit — layout owns the shell */}
  <PageHeaderHero firstName + eyebrow + title + description />
  <KPI grid: 4 status-coded DashboardKpi tiles, each with a drillHref />
  <Body grid: 2/3 main column + 1/3 aside>
    <Section eyebrow="…" title="…">…</Section>
    <aside><Section …>…</Section></aside>
  </Body>
</DevelopmentShell>
```

Full contract — including thresholds, when to use trend deltas, when to
omit them, anti-patterns, and the "new cabinet" checklist — lives in
`docs/stage-10-5-cabinet-dashboard-pattern.md`.

---

## Phase-by-phase

### 10.5.A.1 — First batch (3 cabinets + pattern doc) — +25 tests

Established the pattern. Owner is brand-new (Mgmt OS, no prior
landing); CFO + PM were replatformed from MetricCard-based stubs. CFO
gained `previousSnapshot` (LIMIT 2) to drive trend deltas via
`trendDeltaPct()`; PM gained `projectsAtRisk` (top 5 by riskScore =
qa+2*risks+cos desc).

Pre-flight surprise: `<DashboardKpi>`, `<PageHeaderHero>`, and the
CFO/PM cabinet query helpers were all already shipped in earlier
stages. The actual work was a focused replatform plus one new owner
aggregator (`loadOwnerCabinet`) — pure aggregation over existing
owner-intelligence services, zero new SQL.

### 10.5.A.2 — Second batch (4 cabinets) — +34 tests

Pure replatform. Site Supervisor / QS / Procurement / Marketing got
the new layout vocabulary; their Stage 6 cabinet query helpers were
reused unchanged. Site Supervisor preserved its mobile-first
quick-action grid (touch ≥ 44px). Marketing stayed in Dev OS even
though the launch prompt suggested Mgmt OS — the cost of moving the
route (cabinet_definitions + landing-resolver + redirect) wasn't
justified for this batch.

KPI labels diverged from launch-prompt vocabulary where the data
didn't exist (material costs, budget variance, lead-source mix,
campaign ROI, vendor count, avg cycle time). Each gap is
documented as a carry-over rather than guessed at.

### 10.5.A.3 — Final batch (3 cabinets + redirects + cross-cabinet review + closure) — +~25 tests

Sales Manager / Warehouse Manager / Front Office replatformed. Front
Office is the only Mgmt OS cabinet besides Owner — its hero greets
the user, KPIs surface arrivals / departures / in-house / pending
requests, and the existing board-jump cards moved into the main
column.

The redirect addition came mid-batch from operator feedback (404 on
`/dashboard/project-manager`): 8 thin redirect pages now forward
`/dashboard/{role}` → `/development-os/cabinets/{role}` for every Dev
OS cabinet. Users typing the Mgmt OS URL pattern always land
somewhere correct.

A cross-cabinet consistency test asserts every cabinet (10 total)
imports `DashboardKpi` + `PageHeaderHero` and no cabinet still
imports the legacy `MetricCard`. Future PRs touching cabinet pages
must keep that contract.

---

## What didn't ship (carry-overs)

These items were either explicitly out of scope or hit the bound of
"replatform without new SQL". They become candidates for Stage 10.5.B
(AI integration polish) or 10.5.C (final polish) if operator
prioritises them.

| Carry-over | Source phase | Notes |
|---|---|---|
| Owner financial KPIs (revenue / distributions / bookings) | 10.5.A.1.1 | Cross-system join with investor-portal data; out of Mgmt OS owner-intelligence scope today. |
| PM trend deltas | 10.5.A.1.3 | No `pm_metrics_snapshots` table; would need a new table + cron. |
| PM "Budget vs actual" mini-section | 10.5.A.1.3 | Sum matching dev_transactions per project; compute variance %. |
| CFO real anomaly detection | 10.5.A.1.2 | Currently uses `unclassifiedTransactionsCount` as proxy — Stage 10.5.B candidate. |
| Cashflow forecast chart | 10.5.A.1.2 | Use existing Sparkline primitive in DashboardKpi sparkline slot. |
| Marketing route move (Dev OS → Mgmt OS) | 10.5.A.2.4 | Half-day of cabinet-definitions + landing-resolver wiring. |
| Site Supervisor "Active workers today" (vs yesterday) | 10.5.A.2.1 | Needs realtime workforce log. |
| QS material costs / budget variance KPIs | 10.5.A.2.2 | Needs dev_transactions × cost_categories joins. |
| Procurement vendor count + avg cycle time | 10.5.A.2.3 | Needs vendors aggregate + PO timestamp series. |
| Marketing lead-source mix + campaign ROI | 10.5.A.2.4 | Needs lead-attribution joins. |
| Per-cabinet trend deltas (8 cabinets without snapshot tables) | 10.5.A.2 + .3 | Would need 8 snapshot tables + 8 cron jobs. Out of scope. |
| React-rendering tests for cabinet pages | 10.5.A.1 → 10.5.A.3 | Needs Playwright path; adoption planned for 10.5.C. |
| Sub-domain routing (`investors.arconique.com`) | Stage 10.J carry-over | Stage 7 territory. |

---

## Acceptance gate — STAGE 10.5.A overall

| Check | Target | Result |
|---|---|---|
| 10 cabinet dashboards on the unified pattern | yes | ✅ |
| `<MetricCard>` removed from every cabinet (cross-cabinet test) | yes | ✅ |
| `<DashboardKpi>` + `<PageHeaderHero>` imported by every cabinet | yes | ✅ |
| 2/3-1/3 body split present on every cabinet | yes | ✅ |
| Pattern doc shipped + threshold conventions + anti-patterns + checklist | yes | ✅ |
| `/dashboard/{role}` redirects so Mgmt OS URL pattern doesn't 404 | yes | ✅ 8 thin pages |
| Cross-cabinet consistency test guards future regressions | yes | ✅ |
| Closure doc | yes | ✅ this file |
| TypeScript clean | yes | ✅ |
| Build clean | yes | ✅ |
| Cron 104/103 stable | yes | ✅ |
| Production verification each cabinet | yes | ⛔ awaiting operator review |
| Mobile spot-check | yes | ⛔ awaiting operator review |
| Lighthouse + a11y audit | no | deferred to 10.5.C |

**STAGE 10.5.A — ACCEPTED** (codebase side; production verification pending).

---

## What unblocks Stage 10.5.B

10.5.B is the AI integration polish theme (per master plan): per-agent
API key management UI, provider selection per agent (OpenAI /
Anthropic / Google), test-connection flow, activate/deactivate +
analytics. ~30 tests target. Migration likely (0094 if needed —
already used by Stage 11.A; 10.5.B's would be 0095).

10.5.A.3 leaves no blockers for 10.5.B beyond operator review of the
cabinet visuals. Anomaly-detection carry-over from 10.5.A.1.2 will
naturally land in 10.5.B's per-agent config surface.
