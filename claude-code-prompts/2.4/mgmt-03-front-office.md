# Task — Phase 2.4 PR 3 — Mgmt · Front office

**Reference doc:** `_handoff/cabinets/mgmt-p2/front-office.html`

Today-only view. 3-column board (Variant A). Read §03 carefully — check-in is a 4-step flow that locks the screen on tablet at the counter.

## Files

### Routes

- `src/app/(dashboard)/dashboard/front-office/page.tsx` — NEW · today board
- `src/app/(dashboard)/dashboard/front-office/checkin/[bookingId]/page.tsx` — NEW · 4-step flow
- `src/app/(dashboard)/dashboard/front-office/registry/page.tsx` — NEW · ID/visa registry
- `src/app/(dashboard)/dashboard/front-office/turnover/[villaId]/[date]/page.tsx` — NEW
- `src/app/(dashboard)/dashboard/front-office/day/[ymd]/page.tsx` — NEW · read-only archive

### Components

- `src/components/front-office/today-board.tsx` — NEW · 3-column responsive grid
- `src/components/front-office/guest-card.tsx` — NEW · `.fo-card` flavour (ready/flag/problem)
- `src/components/front-office/checkin-flow.tsx` — NEW · 4-step wrapper
- `src/components/front-office/id-ocr-preview.tsx` — NEW · OCR result + manual override
- `src/components/front-office/turnover-monitor.tsx` — NEW · live cleaning vs check-in progress
- `src/components/front-office/registry-table.tsx` — NEW · visa-aware table

### Schema

```sql
CREATE TABLE guest_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('passport','kitas','ktp')),
  number TEXT NOT NULL,
  expires_at DATE,
  scan_blob_ref TEXT,                  -- encrypted storage ref
  ocr_payload JSONB,
  manual_override BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE visa_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- 'voa_expiring' | 'overstay' | 'kitas_check'
  severity TEXT NOT NULL DEFAULT 'warn',
  details_json JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE turnovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id UUID NOT NULL REFERENCES villas(id),
  checkout_booking_id UUID REFERENCES bookings(id),
  checkin_booking_id UUID REFERENCES bookings(id),
  date DATE NOT NULL,
  cleaning_started_at TIMESTAMPTZ,
  cleaning_done_at TIMESTAMPTZ,
  cleaning_progress_pct INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'  -- pending | cleaning | done | overdue
);

CREATE TABLE checkin_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  step TEXT NOT NULL,                  -- 'identity'|'stay'|'sign'|'handover'
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  payload_json JSONB,
  UNIQUE (booking_id, step)
);

CREATE TABLE tax_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  period_month DATE NOT NULL,          -- first day of month
  payload_json JSONB,                  -- registry snapshot
  status TEXT DEFAULT 'draft',         -- draft|submitted|accepted
  submitted_at TIMESTAMPTZ,
  UNIQUE (org_id, period_month)
);
```

### AI agents (stubs)

- `src/features/ai-agents/id-ocr/` — runs on scan upload · extracts name + nationality + expiry + number · sets `guest_ids.ocr_payload`
- `src/features/ai-agents/visa-watcher/` — daily cron · creates `visa_flags` for VOA approaching 30d
- `src/features/ai-agents/turnover-monitor/` — live · tracks cleaning vs next check-in · alerts front desk
- `src/features/ai-agents/vip-prep/` — runs 24h before arrival · compiles VIP preferences from prior stays

## Wiring example — today board

```tsx
const today = await getTodayBoard();    // { arrivals, inHouse, departures, kpis }

return (
  <DashboardPage>
    <PageHeader title={formatToday()} actions={[<LivePulse />, ...]} />
    <KpiStrip kpis={today.kpis} />
    <ThreeColumnBoard>
      <Column title="Arrivals" count={today.arrivals.length}>
        {today.arrivals.map(b => <GuestCard key={b.id} kind="arrival" booking={b} />)}
      </Column>
      <Column title="In-house" count={today.inHouse.length}>
        {today.inHouse.map(b => <GuestCard key={b.id} kind="in-house" booking={b} />)}
      </Column>
      <Column title="Departures" count={today.departures.length}>
        {today.departures.map(b => <GuestCard key={b.id} kind="departure" booking={b} />)}
      </Column>
    </ThreeColumnBoard>
  </DashboardPage>
);
```

## Validation

```bash
pnpm typecheck && pnpm lint
pnpm test --run --reporter=verbose visa-watcher turnover-monitor
```

Visual:
- 3-column board renders at 1440px · stacks at 900px · single-stream sorted by next-action-time at 600px
- Check-in flow: 4 steps · cannot advance step 1 without OCR success OR manual override (logged)
- Registry page shows VIP and visa flags with correct colours
- Tax export blocked when visa flags unresolved

## Commit message

```
feat(front-office): Mgmt P2 — Front office cabinet

Routes:
- /dashboard/front-office (today 3-column board)
- /front-office/checkin/[bookingId] (4-step flow)
- /front-office/registry (ID + visa registry)
- /front-office/turnover/[villaId]/[date] (turnover detail)
- /front-office/day/[ymd] (read-only archive)

Schema: guest_ids, visa_flags, turnovers, checkin_steps, tax_filings

Check-in flow requires ID OCR success or manual override (audit logged).
Tax export blocked until visa flags resolved (Critical UX rule 2).

Reference: _handoff/cabinets/mgmt-p2/front-office.html
```
