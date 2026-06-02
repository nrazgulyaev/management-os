# Task — Phase 2.4 PR 7 — Dev · Investors + Distributions

**Reference doc:** `_handoff/cabinets/dev-p2/investors.html`

**Last cabinet of Phase 2.4.** Waterfall is canonical math — single calculator, no client-side compute. Read §06 critical rules carefully.

## Files

### Routes

- `src/app/(development-app)/development-os/investors/page.tsx` — NEW · fund-level home (Variant A)
- `src/app/(development-app)/development-os/investors/lp/[id]/page.tsx` — NEW
- `src/app/(development-app)/development-os/investors/distribution/new/page.tsx` — NEW · 4-step flow
- `src/app/(development-app)/development-os/investors/distribution/[id]/page.tsx` — NEW
- `src/app/(development-app)/development-os/investors/capital-call/[id]/page.tsx` — NEW
- `src/app/(development-app)/development-os/investors/quarterly/page.tsx` — NEW · letter composer

### Domain

- `src/features/investors/waterfall-calculator.ts` — NEW — **single source of truth for waterfall math**. Pure function: `(params, proceeds) → WaterfallResult`.
- `src/features/investors/irr-tracker.ts` — NEW — XIRR calculation per LP and fund-level
- `src/features/investors/capital-call-issuer.ts` — NEW — pro-rata calc + notice queue

### Components

- `src/components/investors/waterfall-chart.tsx` — already from PR 0
- `src/components/investors/lp-table.tsx` — NEW · sortable by commitment/contribution/DPI
- `src/components/investors/lp-detail.tsx` — NEW
- `src/components/investors/distribution-flow.tsx` — NEW · 4-step wrapper
- `src/components/investors/distribution-preview-waterfall.tsx` — NEW · live preview as inputs change
- `src/components/investors/capital-call-modal.tsx` — NEW · `<DestructiveConfirmModal>` skin
- `src/components/investors/quarterly-letter-composer.tsx` — NEW

### Schema

```sql
CREATE TABLE funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  vintage INT NOT NULL,                -- year
  hold_years INT NOT NULL DEFAULT 7,
  lpa_ref TEXT,                         -- doc storage ref
  status TEXT NOT NULL DEFAULT 'active',
  org_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES funds(id),
  name TEXT NOT NULL,
  class TEXT NOT NULL DEFAULT 'A',
  primary_contact_id UUID,
  subscription_doc_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id UUID NOT NULL REFERENCES lps(id),
  amount BIGINT NOT NULL,
  class TEXT NOT NULL DEFAULT 'A',
  subscribed_at TIMESTAMPTZ NOT NULL,
  pct_of_fund NUMERIC(7,5)              -- computed at fund close
);

CREATE TABLE waterfall_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES funds(id),
  effective_at TIMESTAMPTZ NOT NULL,
  mgmt_fee_pct NUMERIC(5,2) NOT NULL,
  pref_return_pct NUMERIC(5,2) NOT NULL,
  catch_up_pct NUMERIC(5,2) NOT NULL,
  carry_split_pct NUMERIC(5,2) NOT NULL  -- % to GP
);

CREATE TABLE capital_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES funds(id),
  number INT NOT NULL,
  total BIGINT NOT NULL,
  purpose TEXT NOT NULL,
  notice_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partial','settled')),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  UNIQUE (fund_id, number)
);

CREATE TABLE call_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_call_id UUID NOT NULL REFERENCES capital_calls(id) ON DELETE CASCADE,
  lp_id UUID NOT NULL REFERENCES lps(id),
  amount BIGINT NOT NULL,
  settled_at TIMESTAMPTZ,
  wire_ref TEXT
);

CREATE TABLE distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES funds(id),
  code TEXT NOT NULL,                   -- DIST-YYYY-H1 etc
  period TEXT NOT NULL,
  total_proceeds BIGINT NOT NULL,
  payload_json JSONB NOT NULL,          -- canonical waterfall result
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by UUID,
  approved_hash TEXT,                   -- locks step 4 (Critical UX rule 2)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fund_id, code)
);

CREATE TABLE distribution_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id UUID NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
  lp_id UUID NOT NULL REFERENCES lps(id),
  amount BIGINT NOT NULL,
  settled_at TIMESTAMPTZ,
  wire_ref TEXT
);
```

### AI agents (stubs)

- `src/features/ai-agents/waterfall-calculator/` — exposes `run(fundId, proceeds)` · used by the distribution flow + IRR tracker
- `src/features/ai-agents/irr-tracker/` — weekly · recomputes gross/net IRR + MOIC/DPI/TVPI
- `src/features/ai-agents/quarterly-narrator/` — drafts LP letter from site + sales + finance signals
- `src/features/ai-agents/call-reminder/` — D-3 before due · gentle prompts
- `src/features/ai-agents/wire-reconciler/` — bank webhook → match call/dist allocations

## Wiring — fund-level home

```tsx
const fund = await getFund(slug);
const lps = await getLpsWithPositions(fund.id);
const lastDistribution = await getLastDistribution(fund.id);
const waterfall = await runWaterfall(fund.id, lastDistribution.total_proceeds);

return (
  <DashboardPage>
    <PageHeader title={fund.name} actions={[...]} />
    <KpiStrip kpis={[committed, called, distributed, netIRR, moic]} />
    <WaterfallChart bars={waterfall.bars} unit="IDR billions" onBarClick={openLpAllocationDrawer} />
    <LpTable lps={lps} sort="commitment-desc" />
  </DashboardPage>
);
```

## Critical: waterfall is one calculator

The `waterfall-calculator.ts` is the **only** place math happens. UI receives a `WaterfallResult` object with `bars[]` + footer KPIs precomputed. The 4-step distribution flow's "preview" updates the result by calling the calculator with new inputs — **no client-side delta math**.

The 4th step (approve) is one-way:
1. Locks the `distributions.payload_json`
2. Computes + stores `approved_hash` (sha-256 of payload + actor + timestamp)
3. Queues outbound wires via the bank API
4. Writes audit entries
5. Notifies LPs via email

Re-opening a locked distribution is a separate `voidDistribution` flow with its own approval — not in this PR.

## Validation

```bash
pnpm typecheck && pnpm lint
pnpm test --run waterfall-calculator irr-tracker     # golden tests for math
pnpm test --run wire-reconciler                       # webhook → allocation
```

Visual:
- Waterfall renders all 7 bars at viewport ≥ 1024px · stacks below
- Distribution flow: editing inputs in step 2 updates preview within 250ms
- Step 4 approve modal explicitly confirms "irreversible"
- Capital call modal: pro-rata preview adds to total exactly (no rounding drift)

## Commit message

```
feat(investors): Dev P2 — Investors + Distributions cabinet · Phase 2.4 done

Routes:
- /development-os/investors (fund-level)
- /investors/lp/[id] (LP detail)
- /investors/distribution/new (4-step flow), /investors/distribution/[id]
- /investors/capital-call/[id]
- /investors/quarterly (letter composer)

Schema: funds, lps, commitments, waterfall_params, capital_calls,
call_allocations, distributions, distribution_allocations

Single waterfall-calculator is source of truth · no client-side math (Critical UX rule 1).
Distribution step 4 is one-way · locks payload + computes audit hash (Critical UX rule 2).
Wires are webhook-only · no manual settle (Critical UX rule 4).

Phase 2.4 complete. Next: Phase 2.5 (Platform super-admin).

Reference: _handoff/cabinets/dev-p2/investors.html
```
