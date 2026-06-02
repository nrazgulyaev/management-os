# Task — Phase 2.4 PR 4 — Mgmt · Concierge / Guest stays

**Reference doc:** `_handoff/cabinets/mgmt-p2/concierge.html`

Stays as threads, not rows. Read §05 carefully — the concierge agent handles routine asks autonomously but escalates issues immediately. Comp ≥ IDR 500k requires staff approval.

## Files

### Routes

- `src/app/(dashboard)/dashboard/concierge/page.tsx` — NEW · inbox + focused stay
- `src/app/(dashboard)/dashboard/concierge/stay/[id]/page.tsx` — NEW · full stay page
- `src/app/(dashboard)/dashboard/concierge/templates/page.tsx` — NEW
- `src/app/(dashboard)/dashboard/concierge/recommendations/page.tsx` — NEW

### Components

- `src/components/concierge/request-inbox.tsx` — NEW · left rail list with filter chips
- `src/components/concierge/thread.tsx` — NEW · message thread with composer + agent attribution
- `src/components/concierge/journey-timeline.tsx` — NEW · stay's moments
- `src/components/concierge/comp-watch.tsx` — NEW · running total + cap warning
- `src/components/concierge/template-picker.tsx` — NEW

### Schema

```sql
CREATE TABLE stay_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('wa','email','inapp','phone')),
  latest_msg_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INT DEFAULT 0
);

CREATE TABLE stay_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES stay_threads(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('guest','staff','agent')),
  author_id UUID,                      -- NULL for guest, staff_id for staff, NULL for agent
  body TEXT NOT NULL,
  attachments_ref TEXT[],
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  agent_action_json JSONB              -- if agent action embedded (booking, dispatch)
);
CREATE INDEX stay_messages_thread_at ON stay_messages(thread_id, sent_at DESC);

CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  kind TEXT NOT NULL,                  -- 'maintenance'|'reservation'|'transport'|'concierge'|'other'
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low','done','cancelled')),
  assignee_id UUID,
  agent_handled BOOLEAN DEFAULT FALSE,
  payload_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE journey_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  at TIMESTAMPTZ DEFAULT NOW(),
  kind TEXT NOT NULL,                  -- 'welcome'|'activity'|'recovery'|'departure'|'custom'
  title TEXT NOT NULL,
  description TEXT,
  photo_ref TEXT,
  status TEXT DEFAULT 'live'           -- 'draft'|'live' — agent-curated start as draft
);

CREATE TABLE comp_offered (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  reason TEXT NOT NULL,
  amount BIGINT NOT NULL,              -- IDR
  approved_by UUID,                    -- NULL if auto-approved < 500k
  settled_in_statement_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nps_pulses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id),
  booking_id UUID REFERENCES bookings(id),
  score INT CHECK (score >= -100 AND score <= 100),
  note TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

### AI agents (stubs)

- `src/features/ai-agents/concierge-agent/` — pattern-matches inbound · routine → autonomous reply + auto-action · issue → escalates with timer
- `src/features/ai-agents/comp-policy-checker/` — pre-check before any comp · ≥ IDR 500k requires staff approval
- `src/features/ai-agents/journey-curator/` — scans stay daily · auto-creates draft moments
- `src/features/ai-agents/recovery-monitor/` — URGENT tag triggers manager escalation in 30min

## Wiring example — focused stay

```tsx
const thread = await getThread(stayId);
const stay = await getStay(stayId);
return (
  <ConciergePage>
    <RequestInbox selected={stayId} />
    <FocusedStayPane stay={stay}>
      <Thread messages={thread.messages} onSend={async (body) => {
        await postStaffMessage(thread.id, body);
      }} />
      <SideRail>
        <StayTimeline stay={stay} />
        <RequestList requests={stay.openRequests} />
        <GuestPreferences guest={stay.guest} />
        <CompWatch booking={stay.bookingId} />
      </SideRail>
    </FocusedStayPane>
  </ConciergePage>
);
```

## Validation

```bash
pnpm typecheck && pnpm lint
pnpm test --run --reporter=verbose comp-policy-checker recovery-monitor
```

Visual:
- Agent messages visually distinct (terra-tinted) but guest sees clean replies (no "agent" tag on outbound copy)
- Comp ≥ 500k blocks with modal · < 500k auto-logs
- URGENT request older than 30min surfaces in manager bell

## Commit message

```
feat(concierge): Mgmt P2 — Concierge / Guest stays cabinet

Routes:
- /dashboard/concierge (inbox + focused stay)
- /concierge/stay/[id] (full stay)
- /concierge/templates
- /concierge/recommendations

Schema: stay_threads, stay_messages, requests, journey_moments, comp_offered, nps_pulses

Agent attribution visible to staff, never to guest (Critical UX rule 1).
Comp ≥ IDR 500k requires staff approval (Critical UX rule 2).
URGENT auto-escalates if unresponsive >30min (Critical UX rule 3).

Reference: _handoff/cabinets/mgmt-p2/concierge.html
```
