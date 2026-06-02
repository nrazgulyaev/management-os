# Task — Phase 2.4 PR 2 — Mgmt · Dynamic pricing

**Reference doc:** `_handoff/cabinets/mgmt-p2/dynamic-pricing.html`

Curve-first variant (A). Read §06 carefully — the 8-step pricing engine order of operations is canonical and must match this PR exactly.

## Files

### Routes

- `src/app/(dashboard)/dashboard/pricing/page.tsx` — NEW · hero curve + rules rail
- `src/app/(dashboard)/dashboard/pricing/rules/page.tsx` — NEW · full rule editor
- `src/app/(dashboard)/dashboard/pricing/comp/page.tsx` — NEW · comp set view

### Domain

- `src/features/pricing/engine.ts` — NEW — the 8-step calc (base → season → algo → DOW/occ → events → pins → clamp → write). Pure function on input villa + date → `{amount, audit[]}`.
- `src/features/pricing/rules-evaluator.ts` — NEW — applies a stack of rules in priority order, returns step contributions.
- `src/features/pricing/comp-similarity.ts` — NEW — scoring 0-100 between listings.

### Components

- `src/components/pricing/pricing-curve.tsx` — already in repo from PR 0
- `src/components/pricing/rule-row.tsx` — NEW · for the rules stack (draggable via @dnd-kit)
- `src/components/pricing/rule-editor.tsx` — NEW · side panel on /pricing/rules
- `src/components/pricing/comp-table.tsx` — NEW · highlighted "us" row, sortable

### Schema

```sql
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id UUID REFERENCES villas(id),  -- NULL for org-wide
  priority INT NOT NULL,
  kind TEXT NOT NULL,                    -- 'event'|'occupancy'|'dow'|'season'|'floor'|'ceiling'
  condition_json JSONB NOT NULL,         -- date range / threshold / DOW set / etc
  effect_json JSONB NOT NULL,            -- {kind:'force'|'mul'|'add'|'floor'|'ceiling', value}
  enabled BOOLEAN DEFAULT TRUE,
  pinned BOOLEAN DEFAULT FALSE,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX pricing_rules_priority_idx ON pricing_rules(villa_id, priority);

CREATE TABLE comp_villas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id UUID NOT NULL REFERENCES villas(id),  -- our villa being compared
  ext_source TEXT NOT NULL,             -- 'airbnb' | 'booking-com'
  ext_id TEXT NOT NULL,
  name TEXT,
  location TEXT,
  beds INT,
  similarity_score INT,                  -- 0-100
  active BOOLEAN DEFAULT TRUE,
  UNIQUE (villa_id, ext_source, ext_id)
);

CREATE TABLE comp_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_villa_id UUID NOT NULL REFERENCES comp_villas(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount BIGINT NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (comp_villa_id, date, scraped_at)
);

CREATE TABLE rate_cell_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_cell_id UUID NOT NULL REFERENCES rate_cells(id) ON DELETE CASCADE,
  step INT NOT NULL,                    -- 1..8 (engine step)
  delta BIGINT,                          -- absolute IDR change at this step
  description TEXT,                      -- human-readable
  at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pricing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  tag TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  expected_lift_pct NUMERIC(5,2),
  severity TEXT DEFAULT 'normal'
);
```

### AI agents (stubs)

- `src/features/ai-agents/comp-scraper/` — 2×/day cron · pull external rates · refresh similarity
- `src/features/ai-agents/pricing-narrator/` — explain why a rate is what it is (used in curve tooltips)
- `src/features/ai-agents/pricing-recommender/` — daily · suggests rule edits (drives the highlighted card on /pricing/comp)

## Wiring example

```tsx
const villa = await getVilla(slug);
const series = await getPricingSeries(villa.id, 90);   // algo + active + LY + comp
const overrides = await getActiveOverrides(villa.id);
const rules = await getPricingRules(villa.id);

return (
  <DashboardPage>
    <PageHeader title="Dynamic pricing" actions={[...]} />
    <KpiStrip kpis={[...]} />
    <PricingCurve
      series={series}
      events={await getPricingEvents()}
      overrides={overrides}
      onOverrideDrag={async (date, value) => {
        await upsertOverride(villa.id, date, value, { pinned: true });
      }}
      period="90d"
    />
    <Grid cols={[1.5, 1]}>
      <ActiveRulesStack rules={rules} />
      <CompSetMini villaId={villa.id} />
    </Grid>
  </DashboardPage>
);
```

## Validation

```bash
pnpm typecheck && pnpm lint
pnpm test --run engine                 # 8-step engine — golden tests
pnpm test --run rules-evaluator        # rule cascade
```

Visual:
- Curve renders with 90 days of data, draggable handles
- Pinned overrides survive a `pnpm dev:engine:run` test
- /pricing/rules drag-reorder works · Drop saves

## Commit message

```
feat(pricing): Mgmt P2 — Dynamic pricing cabinet

Routes:
- /dashboard/pricing (curve-first hero)
- /dashboard/pricing/rules (rule editor)
- /dashboard/pricing/comp (comp set)

Schema: pricing_rules, comp_villas, comp_rates, rate_cell_audit, pricing_events

8-step pricing engine: base → season → algo → DOW/occ → events → pins → clamp → write.
Pinned overrides survive algo runs (Critical UX rule 2).
Push to channels happens explicitly (Critical UX rule 3).

Reference: _handoff/cabinets/mgmt-p2/dynamic-pricing.html
```
