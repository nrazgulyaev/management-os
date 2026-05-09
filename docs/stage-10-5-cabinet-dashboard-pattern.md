# Cabinet dashboard pattern (Stage 10.5.A)

**Status**: Established by Stage 10.5.A.1 (Owner / CFO / Project Manager).
Reused by 10.5.A.2 (Site Supervisor / QS / Procurement / Marketing) and
10.5.A.3 (Sales / Warehouse / Front Office).

This doc is the contract for building per-role cabinet dashboards in
Arconique. Future cabinets MUST follow this layout vocabulary unless
they have a documented reason to deviate.

---

## 1. Page skeleton

Every cabinet dashboard renders the same three-zone layout:

```tsx
<DevelopmentShell>           {/* OR no shell wrapper for Mgmt OS — layout owns it */}
  <div className="flex flex-col gap-8">
    <PageHeaderHero ... />                        {/* Zone 1: greeting */}

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <DashboardKpi ... />                        {/* Zone 2: 4 KPIs */}
      <DashboardKpi ... />
      <DashboardKpi ... />
      <DashboardKpi ... />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col gap-6">
        <Section ... />                           {/* Zone 3a: portfolio / main feed */}
        <Section ... />
      </div>
      <aside className="flex flex-col gap-4">
        <Section ... />                           {/* Zone 3b: side panel (alerts) */}
      </aside>
    </div>
  </div>
</DevelopmentShell>
```

**Outer gap**: `gap-8` between zones (Hero → KPIs → body). Inside each
zone, sections use `gap-6` and grids use `gap-4`. This rhythm matches
the design references (heavy whitespace, generous padding).

**Mobile collapse**: KPI grid drops to 2 cols on `sm`, 1 col on default.
Body grid drops to 1 col on default; the side panel stacks below the
main column.

---

## 2. Zone 1 — `<PageHeaderHero>`

Always pass:
- `firstName` (resolved from `getCurrentAppUser()` in the page) — feeds
  the auto greeting "Good morning, {firstName}!".
- `eyebrow` — the cabinet's role label (e.g. "CFO / Accountant").
- `title` — a one-line situation summary that summarizes the most
  important number on the page. Avoid generic copy. Examples:
  - Owner: `"3 villas under your watch."`
  - CFO: `"Financial overview"` (when the page already leads with cash)
  - PM: `"5 active projects"`
- `description` — one sentence that promises what the page delivers.
  Not marketing copy — operator-facing, ≤140 characters.

Do NOT pass `now` unless the page is in a deterministic-test path —
the default `new Date()` is correct for production.

---

## 3. Zone 2 — KPI row (4 tiles)

Always 4 `<DashboardKpi>` tiles. Choose the 4 numbers that:
1. Tell the cabinet's story in one glance.
2. Have a clear "good / bad" interpretation (so `status` is meaningful).
3. Have an obvious drill destination (`drillHref`).

**Required props on every KPI**:
- `label` — short noun phrase, lowercase headline-style ("Cash on hand",
  not "Cash On Hand").
- `value` — the number, formatted (use `formatMinorAsCurrency` for
  money, plain integers for counts, `.toFixed(0)` for scores).
- `status` — `good` / `warn` / `bad` / `neutral`. The page must encode
  thresholds; do not always pass `"neutral"`.
- `drillHref` — every KPI is a link to where the operator inspects the
  detail. Aggregates without a drill destination should not be KPIs.

**Recommended props**:
- `unit` — for currency-less numbers ("villas", "/ 100", "/ 8").
- `delta` — `{ value: number, label: "vs prior period" }` when a
  prior-period number is available. Use `trendDeltaPct(current, prev)`
  from `widgets-helpers.ts`.
- `hint` — a short clarifier under the value ("vs Rp 5M due 30d").

**Threshold conventions** (use these unless the cabinet has a stronger
reason):
| Domain | good | warn | bad |
|---|---|---|---|
| Counters where 0 is best (open issues, overdue, anomalies) | `=== 0` | `> 0 && ≤ small` | `> bigger` |
| Counters where higher is better (good-health villas) | `=== total` | `≥ 60% × total` | `< 60% × total` |
| Currency where higher is better (cash on hand) | `> payables_30d` | `< payables_30d` | `≤ payables_overdue` |
| Currency where lower is better (overdue) | `=== 0` | `< 10% of cash` | `≥ 10% of cash` |
| Score (0–100) | `≥ 80` | `≥ 60` | `< 60` |

Pages should write small helpers (e.g., `cashStatus(snap)`) to keep
the JSX readable. See `cfo-accountant/page.tsx` for examples.

---

## 4. Zone 3 — Body (2/3 main + 1/3 side)

### Main column (`lg:col-span-2`)
- 1 to 3 `<Section>` blocks, each with `eyebrow` + `title`.
- Use **portfolio grids** (cards) for entity collections (villas,
  projects, vendors).
- Use **inline `<DashboardKpi>` rows** for sub-metrics (e.g., "30 / 60
  / 90 day forecast" → 3 KPIs).
- Empty states use `<NoItemsYet entityLabel="villas">` (the primitive
  composes the right copy automatically).

### Side column (`<aside>`)
- 1 to 2 `<Section>` blocks. The first is the **alerts / activity
  feed**: a vertically-divided list inside a `rounded-md border
  border-line-soft bg-surface` container.
- Each list item is a `<Link>` (whole-row click target) with a status
  pill on the right.
- Always end the section with a "View all →" or hub link in
  `text-xs text-ink-tertiary hover:underline`.

---

## 5. Data plumbing

### Cabinet query helper
Each cabinet has one server-only query helper at
`src/lib/development/server/cabinets/{role}-cabinet-queries.ts`. The
helper:
- Returns one shape: `{role}CabinetData`. All fields default to safe
  empties when DB is unconfigured (`getDb()` returns null).
- Reuses existing services where possible. Don't write new SQL when an
  existing service already returns the data.
- Adds **one** server-side computation per KPI that needs a derived
  number (status, delta, score). Keep it pure where possible so tests
  can hit it directly.

### Page wrapper
Every cabinet page MUST:
1. Call `gateCabinetForCurrentOrg("{cabinet-key}")` and redirect on
   the result (Mgmt OS owner cabinet skips this — its (dashboard)
   layout enforces `mgmt` product access).
2. Resolve `me = await getCurrentAppUser()` to feed `firstName` to the
   hero.
3. Wrap the data load in `safeQuery("{cabinetKey}", load{Role}Cabinet(),
   { /* empty-state shape */ })` so DB outages render as empties, not
   500s.
4. Mark the page `export const dynamic = "force-dynamic"` (cabinet data
   is per-request).

---

## 6. Trend deltas

Trend deltas surface the cabinet's most important "is this getting
better or worse" signal. Compute them server-side using the snapshot
table that backs the cabinet:
- **CFO** — `executive_metrics_snapshots` ordered by `snapshot_date
  DESC LIMIT 2`; the second row is the prior period.
- **Owner** — `villa_health_snapshots` is per-villa; group by villa,
  pick the latest two per villa, average across villas for portfolio
  KPIs.
- **PM** — no snapshot table exists yet. Trend deltas are
  intentionally absent from the PM dashboard. Carry-over for 10.5.A.2
  if operator wants them.

When `previous` is null, **omit the `delta` prop entirely**. Don't
pass `delta: { value: 0 }`; that renders a misleading "flat" arrow.

---

## 7. Adding a new cabinet (checklist)

1. Inventory the data: list 4 KPIs + 1 portfolio surface + 1 alerts
   surface. If you can't get to 4 + 1 + 1, the cabinet probably
   doesn't need a dashboard yet — link the role to the closest
   existing cabinet instead.
2. Add or reuse the cabinet query helper. New helpers go in
   `src/lib/development/server/cabinets/`.
3. Build the page following the skeleton in §1.
4. Test: 1-2 tests per KPI threshold helper (pure functions),
   1 test confirming the page imports the right primitives, 1 test
   confirming the page is gated.
5. Document any cabinet-specific exception in `tmp/stage-10-5-a-{batch}-decisions.md`.

---

## 8. Anti-patterns (don't do)

- **Don't use `<MetricCard>` on a cabinet dashboard.** That primitive
  predates `<DashboardKpi>` and lacks status, delta, drill. Migrate
  legacy cabinets when you touch them.
- **Don't fan out to more than 4 KPIs in Zone 2.** A 5th tile breaks
  the visual rhythm and signals you have a section, not a KPI strip.
  Move the extra into a sub-section in Zone 3.
- **Don't put server actions on a cabinet dashboard.** Cabinets are
  read-only landing pages. Mutations live on detail pages or
  modals reached via drill links.
- **Don't surface raw IDs** ("Villa 8e3a4b1c…") in user-facing copy.
  Resolve to villa code or name; fall back to a short slice only
  when nothing better is available.
- **Don't add a hero greeting if no `firstName` is available.** Pass
  `undefined` so the greeting line collapses cleanly.

---

## 9. Files to look at

- `src/components/ui/primitives/dashboard-kpi.tsx` — the KPI tile
- `src/components/ui/primitives/page-header-hero.tsx` — the hero
- `src/components/ui/primitives/empty-state-variants.tsx` — empty states
- `src/components/ui/section.tsx` — Section wrapper
- `src/lib/development/server/executive/widgets-helpers.ts` —
  `formatMinorAsCurrency`, `trendDeltaPct`
- `src/lib/development/safe-query.ts` — `safeQuery` wrapper
- `src/app/(dashboard)/dashboard/owner/page.tsx` — Owner reference
- `src/app/(development-app)/development-os/cabinets/cfo-accountant/page.tsx` — CFO reference
- `src/app/(development-app)/development-os/cabinets/project-manager/page.tsx` — PM reference
