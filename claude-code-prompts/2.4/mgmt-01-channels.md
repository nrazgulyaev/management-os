# Task — Phase 2.4 PR 1 — Mgmt · Channels + Direct bookings

**Reference doc:** `_handoff/cabinets/mgmt-p2/channels.html`

The production heart of Mgmt P2. Every revenue cabinet downstream consumes this. Read the cabinet doc carefully — especially §05 conflict modal (default focus = Cancel) and §08 state machine.

## Files

### Routes

- `src/app/(dashboard)/dashboard/channels/page.tsx` — NEW · grid overview (Variant A)
- `src/app/(dashboard)/dashboard/channels/[slug]/page.tsx` — NEW · per-channel health
- `src/app/(dashboard)/dashboard/channels/connect/page.tsx` — NEW · 3-step wizard
- `src/app/(dashboard)/dashboard/bookings/direct/page.tsx` — NEW · direct bookings list
- `src/app/(dashboard)/dashboard/bookings/direct/[id]/page.tsx` — NEW · direct booking detail
- `src/app/(dashboard)/dashboard/bookings/direct/new/page.tsx` — NEW · ops can create

### Domain

- `src/features/channels/state-machine.ts` — NEW
  - `type CellSyncState = 'pending' | 'synced' | 'stale' | 'conflict' | 'blocked' | 'booked'`
  - `transition(state, event): CellSyncState`
  - `STALE_AFTER_MS = 4 * 60 * 60 * 1000` (4h)
  - `getNextActions(state, role): Action[]`

- `src/features/channels/conflict-resolver.ts` — NEW
  - 3 resolutions: `accept-channel`, `force-ours`, `flag-and-pause`
  - returns audit payload + queues retry or ticket

### Components

- `src/components/channels/channel-grid.tsx` — already in repo from PR 0
- `src/components/channels/conflict-modal.tsx` — NEW · `<DestructiveConfirmModal>` skin with default focus = Cancel
- `src/components/channels/connect-wizard.tsx` — NEW · 3-step
- `src/components/channels/listing-matcher.tsx` — NEW · for step 3 of wizard
- `src/components/channels/direct-booking-detail.tsx` — NEW · composes Phase 2.1 DetailPage bricks + new `<FeeDeltaBrick>` (savings vs cheapest OTA) + cross-channel availability strip (re-uses ChannelGrid in display mode)

### Schema migration

`drizzle/0xx-channels.sql`:

```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,         -- 'direct' | 'airbnb' | 'booking-com' | 'avito'
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('direct','ota')),
  fee_pct NUMERIC(5,2) DEFAULT 0,
  auth_json JSONB,
  enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  org_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channel_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  villa_id UUID NOT NULL REFERENCES villas(id),
  ext_id TEXT NOT NULL,              -- channel's listing id
  ext_name TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  UNIQUE (channel_id, ext_id)
);

CREATE TABLE rate_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id UUID NOT NULL REFERENCES villas(id),
  channel_id UUID NOT NULL REFERENCES channels(id),
  date DATE NOT NULL,
  amount BIGINT NOT NULL,            -- IDR, integer
  source TEXT NOT NULL CHECK (source IN ('algo','manual','pinned','rule')),
  pushed_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  acked_value BIGINT,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (villa_id, channel_id, date)
);
CREATE INDEX rate_cells_villa_date_idx ON rate_cells(villa_id, date);
CREATE INDEX rate_cells_stale_idx ON rate_cells(sync_state) WHERE sync_state IN ('stale','conflict');

CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id),
  rate_cell_id UUID REFERENCES rate_cells(id),
  kind TEXT NOT NULL,                -- 'push' | 'pull' | 'ack' | 'conflict' | 'stale' | 'error'
  payload JSONB,
  actor_id UUID,                     -- user_id or NULL for system
  at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE direct_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,         -- DBK-YYYY-####
  villa_id UUID NOT NULL REFERENCES villas(id),
  guest_id UUID REFERENCES guests(id),
  status TEXT NOT NULL DEFAULT 'inquiry',
  checkin DATE NOT NULL,
  checkout DATE NOT NULL,
  adr BIGINT NOT NULL,
  fees_avoided BIGINT,               -- savings vs cheapest OTA at booking time
  source TEXT NOT NULL,              -- 'direct.site' | 'whatsapp' | 'email' | 'phone'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_channel_id UUID REFERENCES channels(id);
ALTER TABLE villas ADD COLUMN IF NOT EXISTS direct_listing_slug TEXT UNIQUE;
```

### AI agents (stubs)

`src/features/ai-agents/channel-listing-matcher/`, `src/features/ai-agents/conflict-investigator/`, `src/features/ai-agents/direct-conversion-scorer/` — stub files with input/output types + a placeholder `run()` that returns mock data. Real implementations are out of scope this PR.

## Wiring example — grid overview page

```tsx
import { ChannelGrid } from '@/components/channels/channel-grid';
import { ConflictModal } from '@/components/channels/conflict-modal';
import { getChannelGridData, pushRate } from '@/features/channels/queries';

export default async function ChannelsPage() {
  const data = await getChannelGridData({ days: 14 });
  // …
  return (
    <DashboardPage>
      <PageHeader ... />
      <KpiStrip kpis={data.kpis} />
      <FilterBar ... />
      <ChannelGrid
        villas={data.villas}
        channels={data.channels}
        dates={data.dates}
        cells={data.cells}
        stays={data.stays}
        onCellEdit={async (key, amount) => { await pushRate(key, amount); }}
      />
      <ActivityRail events={data.recentEvents} funnel={data.directFunnel} />
    </DashboardPage>
  );
}
```

## Validation

```bash
pnpm typecheck && pnpm lint && pnpm test --run --reporter=verbose state-machine
pnpm dev   # exercise /dashboard/channels at 1440px and 700px
```

Visual checks:
- 14-day grid renders without horizontal scroll at 1440px
- Inline cell edit: Enter saves, Esc cancels, Tab advances right
- Conflict modal default focus is **Cancel** (tab order verified)
- Connect wizard step 3 renders fuzzy-matched + ambiguous + unmatched listings
- Direct booking detail shows the cross-channel availability strip with all OTAs blocked

## Commit message

```
feat(channels): Mgmt P2 — Channels + Direct bookings cabinet

Routes:
- /dashboard/channels (grid overview)
- /dashboard/channels/[slug] (per-channel health)
- /dashboard/channels/connect (3-step wizard)
- /dashboard/bookings/direct (list)
- /dashboard/bookings/direct/[id] (detail)
- /dashboard/bookings/direct/new (ops create)

Schema: channels, channel_listings, rate_cells, sync_events, direct_bookings
+ bookings.source_channel_id, villas.direct_listing_slug

State machine: 6 rate-cell states (pending/synced/stale/conflict/blocked/booked)
Conflict resolver: 3 actions (accept/force/flag-pause)
Direct booking ALWAYS blocks OTAs atomically (Critical UX rule 1).

Reference: _handoff/cabinets/mgmt-p2/channels.html
```
