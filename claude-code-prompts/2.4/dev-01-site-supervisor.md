# Task — Phase 2.4 PR 5 — Dev · Site supervisor + reports

**Reference doc:** `_handoff/cabinets/dev-p2/site-supervisor.html`

Storyboard view. Read §03 carefully — the mobile capture flow is the *only* ingestion path. No desktop uploads. Read §06 critical rules.

## Files

### Routes

- `src/app/(development-app)/development-os/site/page.tsx` — NEW · storyboard scroll (Variant A)
- `src/app/(development-app)/development-os/site/[projectId]/[date]/page.tsx` — NEW · day permalink
- `src/app/(development-app)/development-os/site/incident/[id]/page.tsx` — NEW · incident detail
- `src/app/(development-app)/development-os/site/qa/[id]/page.tsx` — NEW · QA flag detail
- `src/app/(development-app)/development-os/site/[projectId]/week/[isoWeek]/page.tsx` — NEW · weekly web view
- `src/app/(public)/site-capture/page.tsx` — NEW · PWA standalone capture flow (mobile only)

### Components

- `src/components/site-reports/storyboard-log.tsx` — already from PR 0
- `src/components/site-reports/capture-flow.tsx` — NEW · 3-step (camera → caption → tag)
- `src/components/site-reports/incident-detail.tsx` — NEW
- `src/components/site-reports/weekly-report-pdf.tsx` — NEW · react-pdf
- `src/components/site-reports/voice-input.tsx` — NEW · uses Web Speech API

### Domain

- `src/features/site-reports/severity.ts` — NEW · classify incident severity
- `src/features/site-reports/weekly-composer.ts` — NEW · runs fri 16:30 · picks 3 hero frames

### New dep

```bash
pnpm add react-pdf-renderer @react-pdf/renderer react-zoom-pan-pinch
```

### Schema

```sql
CREATE TABLE site_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  date DATE NOT NULL,
  author_id UUID NOT NULL,
  weather_json JSONB,                  -- {temp, condition, stop_hours}
  stop_hours NUMERIC(4,2) DEFAULT 0,
  summary_md TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, date, author_id)
);

CREATE TABLE site_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_day_id UUID NOT NULL REFERENCES site_days(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('milestone','incident','qa','progress')),
  severity TEXT CHECK (severity IN ('p1','p2','p3','info')),
  caption TEXT NOT NULL,
  narration TEXT,
  photo_ref TEXT NOT NULL,             -- storage ref
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  taken_at TIMESTAMPTZ NOT NULL,
  milestone_id UUID REFERENCES milestones(id),
  side_json JSONB,                     -- 4 k/v rows for the side card
  posted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX site_frames_day_idx ON site_frames(site_day_id);

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id UUID NOT NULL REFERENCES site_frames(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',  -- open|in_progress|resolved
  impact_json JSONB,                    -- {schedule_days, cost_idr, crew_redirect}
  linked_rfi_id UUID,                   -- auto-opened by classifier
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

CREATE TABLE qa_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id UUID NOT NULL REFERENCES site_frames(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',  -- open|under_review|cleared|escalated
  qs_owner_id UUID,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  at TIMESTAMPTZ DEFAULT NOW(),
  actor_id UUID NOT NULL,
  note TEXT NOT NULL
);

CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  iso_week TEXT NOT NULL,              -- 'YYYY-WW'
  payload_json JSONB NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  distribution_json JSONB,             -- {owners, investors, public, buyers}
  UNIQUE (project_id, iso_week)
);
```

### AI agents (stubs)

- `src/features/ai-agents/caption-cleaner/` — clean voice transcripts · suggest milestone links
- `src/features/ai-agents/incident-classifier/` — suggest severity · auto-open RFI for procurement/QS when shortage/defect detected
- `src/features/ai-agents/weekly-composer/` — fri 16:30 cron · pick 3 hero frames · draft summary
- `src/features/ai-agents/photo-organiser/` — cluster duplicates · suggest deletions

## Wiring — storyboard scroll

```tsx
const days = await getSiteDays({ projectId, days: 7 });

return (
  <DashboardPage>
    <StickyHeader>
      <PageHeader title="Canggu West · daily log" />
      <KpiStrip kpis={...} />
    </StickyHeader>
    {days.map(d => (
      <StoryboardLog key={d.id} day={d} onFrameClick={(f) => openLightbox(f)} />
    ))}
  </DashboardPage>
);
```

## Critical: capture flow is PWA-standalone

The capture flow at `/site-capture` is served from `(public)` segment without sidebar/topbar. It must:
- Request camera + geolocation permission on load
- Block submit if GPS coord not obtained (configurable per project)
- Work offline (drafts queue locally, sync on reconnect)
- Be installable as PWA (add manifest entry)

## Validation

```bash
pnpm typecheck && pnpm lint
pnpm test --run incident-classifier weekly-composer
```

Visual:
- Storyboard scroll renders with sticky meta column on desktop · stacks on mobile
- Capture flow on phone takes <30s end-to-end (manual stopwatch)
- Weekly report PDF generates with 3 hero frames + KPI strip
- Photos without GPS are flagged and excluded from weekly report

## Commit message

```
feat(site-reports): Dev P2 — Site supervisor + reports cabinet

Routes:
- /development-os/site (storyboard scroll)
- /site/[projectId]/[date] (day permalink)
- /site/incident/[id], /site/qa/[id]
- /site/[projectId]/week/[YYYY-WW]
- /site-capture (PWA capture flow)

Schema: site_days, site_frames, incidents, qa_flags, decision_log, weekly_reports

Capture flow is only ingestion path (Critical UX rule 1).
P1 incidents auto-open RFIs (Critical UX rule 2).
QA flags require QS sign-off (Critical UX rule 3).
Weekly report needs construction lead approve (Critical UX rule 4).
Photos without GPS excluded from weekly (Critical UX rule 5).

Reference: _handoff/cabinets/dev-p2/site-supervisor.html
```
