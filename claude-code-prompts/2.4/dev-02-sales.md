# Task — Phase 2.4 PR 6 — Dev · Sales + Buyers + Contracts

**Reference doc:** `_handoff/cabinets/dev-p2/sales.html`

5-lane kanban (Variant A). Read §06 carefully — drag-between-lanes auto-stamps audit, offers above list need approval, payment reconciler is webhook-only.

## Files

### Routes

- `src/app/(development-app)/development-os/sales/page.tsx` — NEW · kanban
- `src/app/(development-app)/development-os/sales/buyer/[id]/page.tsx` — NEW
- `src/app/(development-app)/development-os/sales/contract/[id]/page.tsx` — NEW
- `src/app/(development-app)/development-os/sales/forecast/page.tsx` — NEW · funnel view
- `src/app/(development-app)/development-os/sales/inbound/page.tsx` — NEW · referral admin
- `src/app/(public)/inquire/[projectSlug]/page.tsx` — NEW · public referral form

### Components

- `src/components/sales/pipeline-board.tsx` — already from PR 0
- `src/components/sales/buyer-detail.tsx` — NEW · profile + unit + activity (composes 2.1 DetailPage bricks)
- `src/components/sales/contract-page.tsx` — NEW · 4-tab (document/payment/signatures/activity)
- `src/components/sales/payment-ladder.tsx` — NEW · 3-stage stepper with status pills
- `src/components/sales/offer-modal.tsx` — NEW · modal with above-list approval gate
- `src/components/sales/funnel-chart.tsx` — NEW · SVG funnel for /sales/forecast

### Schema

```sql
CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  source TEXT,                          -- 'inbound'|'referral'|'agent'|'event'
  funding_kind TEXT,                    -- 'cash'|'mortgage'|'mixed'|'unknown'
  primary_contact_json JSONB,
  score INT DEFAULT 0,
  org_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES buyers(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  units_interest UUID[] DEFAULT '{}',  -- unit ids
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','qualified','tour','contract','closed','lost')),
  stage_at TIMESTAMPTZ DEFAULT NOW(),
  probability INT DEFAULT 10,           -- 0-100
  expected_value BIGINT,                -- IDR
  assignee_id UUID,
  hot BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX leads_stage_idx ON leads(stage);
CREATE INDEX leads_assignee_idx ON leads(assignee_id);

CREATE TABLE stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  at TIMESTAMPTZ DEFAULT NOW(),
  actor_id UUID NOT NULL,
  auto_stamped BOOLEAN DEFAULT FALSE,
  note TEXT
);

CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES buyers(id),
  kind TEXT NOT NULL CHECK (kind IN ('call','mtg','email','tour','offer','score','referral_in')),
  at TIMESTAMPTZ DEFAULT NOW(),
  summary TEXT,
  attachments_ref TEXT[],
  author_id UUID,
  payload_json JSONB
);

CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  unit_id UUID NOT NULL REFERENCES units(id),
  amount BIGINT NOT NULL,
  list_price BIGINT NOT NULL,
  approved_by UUID,                     -- required if amount < list_price
  valid_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','countered','expired','accepted','declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  code TEXT NOT NULL UNIQUE,            -- CT-YYYY-###
  doc_version INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','countersigned','in_payment','completed','cancelled')),
  total BIGINT NOT NULL,
  payment_schedule_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,                  -- 'deposit'|'progress'|'completion' or custom
  amount BIGINT NOT NULL,
  due_at DATE,
  paid_at TIMESTAMPTZ,
  settlement_ref TEXT,                  -- bank webhook ref
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  party TEXT NOT NULL,                  -- 'buyer'|'seller'|'witness'
  signer_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  ip TEXT,
  doc_hash TEXT NOT NULL
);
```

### AI agents (stubs)

- `src/features/ai-agents/lead-scorer/` — daily · scores 0-100 · drives "hot" + sort
- `src/features/ai-agents/stage-stale-watcher/` — flags &gt; 14d stuck · suggests action
- `src/features/ai-agents/offer-drafter/` — drafts offer from lead + unit · requires approve
- `src/features/ai-agents/contract-redline-summariser/` — diff between contract versions
- `src/features/ai-agents/payment-reconciler/` — bank webhook → match installments

## Wiring — kanban

```tsx
const lanes = await getPipelineLanes({ projectId });
const cards = await getPipelineCards({ projectId });

return (
  <DashboardPage>
    <PageHeader title="Buyer pipeline" actions={[...]} />
    <KpiStrip kpis={...} />
    <FilterBar />
    <PipelineBoard
      lanes={lanes}
      cards={cards}
      onMove={async (cardId, from, to, position) => {
        await transitionLead(cardId, to, { position, actor: currentUserId });
      }}
      onCardClick={(id) => router.push(`/sales/buyer/${id}`)}
    />
  </DashboardPage>
);
```

## Validation

```bash
pnpm typecheck && pnpm lint
pnpm test --run lead-scorer payment-reconciler
```

Visual:
- Kanban: drag between lanes lifts -1.5°, drops with audit entry
- Offer below list → modal asks for manager approval
- Contract page payment ladder shows correct status per installment
- Closed-Won card transitions to read-only (no drag handle)

## Commit message

```
feat(sales): Dev P2 — Sales + Buyers + Contracts cabinet

Routes:
- /development-os/sales (5-lane kanban)
- /sales/buyer/[id], /sales/contract/[id]
- /sales/forecast (funnel), /sales/inbound
- /inquire/[projectSlug] (public referral form)

Schema: buyers, leads, stage_events, interactions, offers, contracts,
payment_installments, signatures

Stage transitions audit-logged automatically (Critical UX rule 1).
Offers below list require manager approval (Critical UX rule 2).
Closed-Won read-only from kanban (Critical UX rule 3).
Payment reconciler is webhook-only — no manual mark-paid (Critical UX rule 5).

Reference: _handoff/cabinets/dev-p2/sales.html
```
