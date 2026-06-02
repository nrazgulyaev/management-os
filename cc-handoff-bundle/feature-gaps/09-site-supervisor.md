# Feature gap · 09 · Site supervisor (Dev P2)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built deep. Routes: `/development-os/site-reports` (`page.tsx` 10.4kb + `[id]` **15kb** + `new` **19.2kb** + error boundary) and `/development-os/operations/site-reports/quick-photo` (5kb · the mobile capture flow). Pure fns confirmed: `site-reports/{severity.ts, weekly-composer.ts, queries.ts}`. **Discard "route/page not built".** Surviving: the import's `queries.ts` was stubbed — **re-verify in `main` whether the data fns are now wired** (the `[id]`/`new` pages at 15–19kb strongly imply real reads); agent roster (`construction_supervisor`, `photo_analyst`, `daily_digest`, `weekly_plan` are real — design's `caption-cleaner`/`incident-classifier`/`photo-organiser` are the fictional/pure-fn layer).

**Design sources**
- Desktop: `cabinets/dev-p2/site-supervisor.html` — 6 sections (hero log, layout variants, mobile capture, incident detail, weekly report, schema)
- Mobile: `mobile-pass-2.4-cabinets.html` § cabinet 05 — capture-flow + voice-input
- Phase: 2.4 dev-01 · commit `599690a`

**Repo paths (state as of feature-gap audit window)**
- Pure domain: `_repo/src/features/site-reports/{severity,weekly-composer,queries}.ts` — 3 files
- Agents: **NO `_repo/src/features/ai-agents/site-reports/` folder** — the 4 agents the cabinet's design promises (incident-classifier, captioner, weekly-drafter, site-supervisor) are NOT imported
- Schema · core (mig 0040): `site_zones`, `site_reports`, `site_report_zones`, `site_report_photos`, `site_workforce_logs`, `safety_incidents`
- Schema · AI (mig 0042): `ai_construction_analyses` — generic AI analysis blob attached to site_reports
- **Not imported into this project:** `src/components/site-reports/*` (storyboard-log, capture-flow, voice-input, incident-detail, weekly-report-pdf all referenced by `queries.ts` type imports), `src/app/(dashboard)/development-os/site-supervisor/*`, **and the entire `ai-agents/site-reports/` agent set**.

## TL;DR

Site supervisor's design language (**"frames" + storyboard log + per-frame severity classification + voice-narrated capture**) doesn't match the repo's schema language (**"site_reports" with attached photos + workforce logs + safety incidents**). The schema is rich and properly normalised (6 tables + an AI analyses table), but it models daily/per-zone supervisor reports, not the per-photo "frame" the cabinet treats as its atomic unit. The two pure modules — `severity.ts` (4-tier P1-P3-info classifier with keyword lists + cost/schedule thresholds) and `weekly-composer.ts` (deterministic hero-frame selector with GPS-required filter) — are the **strongest dev-OS code in the audited set**. They run on synthetic test data identical to production. But: zero agents in `ai-agents/site-reports/` (the entire AI surface for this cabinet is missing from this repo import), no `weekly_reports` persistence table, no `site_frames` view aligning design vocab to schema, and `queries.ts` is fully stubbed.

---

## Section-by-section

### 01 · Hero · storyboard log

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Per-project storyboard (vertical scroll, day-grouped) | designed | `queries.ts.getSiteDays()` returns `[]`; schema fragmented (frames vs reports mismatch) | 🟡 schema exists, vocab mismatch | 🔥 P0 |
| Per-frame: photo + caption + GPS + severity badge | designed | `site_report_photos` has photo + caption; **GPS column unclear**, severity computed by `classifySeverity()` ✅ but not persisted | 🟡 partial | 🔥 P0 |
| KPI strip (today's frames · open P1s · workforce on site · safety incidents 7d) | designed | computable from `site_reports + safety_incidents + site_workforce_logs` | 🟡 schema ready, fn missing | ⭐ P1 |
| Per-zone activity rail | designed | `site_zones` + `site_report_zones` shipped ✅ | ✅ schema | — |
| Frame click → incident detail | designed | `getIncident()` stubbed | 🟡 stub | ⭐ P1 |
| Filter by zone / severity / contractor | designed | not surfaced | 🔴 design only | ⭐ P1 |

### 02 · Layout variants

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| **Variant A**: Storyboard scroll (default) | designed | implied | 🔴 not picked in code | 💭 P2 |
| **Variant B**: Zone-grid (4-up cards × today/yesterday) | designed | not in repo | 🔴 design only | 💭 P2 |

**Recommendation:** Variant A — matches how the weekly-composer picks frames (chronological), matches mobile capture flow (one frame at a time → scroll), matches the schema's `site_report_photos.taken_at` natural sort. Variant B is for status-at-a-glance which is better served by the project PM cabinet.

### 03 · Mobile capture flow

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Camera-first capture (photo → caption → voice → severity) | designed | `submitSiteFrame(CaptureDraft)` stubbed | 🟡 stub | 🔥 P0 |
| Voice-to-text narration (Critical UX rule 4) | designed | no `voice-input.tsx` component imported, no transcription helper in feature folder | 🔴 design only | 🔥 P0 |
| GPS auto-captured + required (rule 5) | designed | `weekly-composer.ts` excludes frames without GPS ✅ (logic correct); capture flow's GPS write is stubbed | 🟡 enforcement logic ready, write missing | 🔥 P0 |
| Local-first queue (capture offline, sync when reachable) | designed | no offline queue | 🔴 design only | ⭐ P1 |
| Caption auto-suggestion from photo (captioner agent) | designed | **no captioner agent imported** | 🔴 design only | ⭐ P1 |
| Severity badge auto-set from `classifySeverity()` | designed | pure fn ✅; not called from capture flow yet | 🟡 logic ready, no wire | ⭐ P1 |

### 04 · Incident detail

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Full-page at `/site-supervisor/incident/[id]` | designed | route not in proj | 🟡 unknown | ⭐ P1 |
| Timeline (created → triaged → mitigated → closed) | designed | `safety_incidents` shipped; no transition table | 🟡 schema, no FSM | ⭐ P1 |
| Linked frames / photos | designed | `site_report_photos` linked via `site_report_id`; no per-frame incident link | 🟡 link via report only | ⭐ P1 |
| Cost + schedule impact fields | designed | unclear if on `safety_incidents` row (need to check) | 🟡 likely on schema | ⭐ P1 |
| Sign-off chain (foreman → PM → director) | designed | not surfaced; needs `safety_incident_signoffs` table | 🔴 missing | ⭐ P1 |
| Notify-stakeholders action | designed | needs `support_tickets` or notification fan-out | 🔴 not wired | ⭐ P1 |

### 05 · Weekly report

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Auto-composed draft (3 hero frames + summary) | designed | `weekly-composer.ts.composeWeeklyReport()` ✅ deterministic, GPS-required, snapshot-testable | ✅ logic shipped | — |
| Selection priority (P1 photos → milestones → spotlight) | designed | implemented in composer ✅ | ✅ shipped | — |
| PDF export | designed | no `weekly-report-pdf.tsx` in proj; `queries.ts.getWeeklyReport()` returns `WeeklyReportProps` type only | 🟡 type-shaped | ⭐ P1 |
| Persistence (`weekly_reports` table) | designed | **no migration creates `weekly_reports`** | 🔴 missing | 🔥 P0 |
| Cron trigger (weekly Mon 09:00) | designed | no scheduling artefact | 🔴 missing | ⭐ P1 |
| Excluded-frames footer (GPS-missing list) | designed | composer output includes `excluded[]` ✅ | ✅ logic | — |
| Manual override (PM picks different hero frames) | designed | not surfaced | 🔴 design only | 💭 P2 |
| Distribution (email investors / owners) | designed | needs `notification_routes` integration | 🔴 missing | ⭐ P1 |

### 06 · Schema · agents · routes

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| `site_reports` (daily report per project) | designed | shipped (mig 0040) ✅ | ✅ | — |
| `site_zones` + `site_report_zones` | designed | shipped (mig 0040) ✅ | ✅ | — |
| `site_report_photos` | designed | shipped (mig 0040) ✅ | ✅ | — |
| `site_workforce_logs` | designed | shipped (mig 0040) ✅ | ✅ | — |
| `safety_incidents` | designed | shipped (mig 0040) ✅ | ✅ | — |
| `ai_construction_analyses` (generic AI blob per report) | designed-adjacent | shipped (mig 0042) ✅ | ✅ | — |
| `weekly_reports` | designed | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `site_frames` view (re-projects photos as the design's "frame" unit) | designed | 🔴 no view | 🔴 missing | ⭐ P1 |
| `safety_incident_signoffs` (sign-off chain) | designed | 🔴 not in any migration | 🔴 missing | ⭐ P1 |
| `incident-classifier` agent | designed | 🔴 **no agent file imported** | 🔴 missing | 🔥 P0 |
| `captioner` agent (photo → suggested caption) | designed | 🔴 **no agent file imported** | 🔴 missing | ⭐ P1 |
| `weekly-drafter` agent (cron wrapper around `composeWeeklyReport`) | designed | 🔴 **no agent file imported** | 🔴 missing | ⭐ P1 |
| `site-supervisor` agent (cross-project ranking, like concierge supervisor copilot) | implied (parallel to concierge_handoff in mig 0101) | 🟡 not in `ai_agents_registry` enum (mig 0103 lists only 5 copilots) | 🔴 not registered | ⭐ P1 |

---

## Cross-cutting

### Data wiring

| Concern | Status |
|---|---|
| `getSiteDays()` returns storyboard data | 🔴 vocab-mismatched + fn stubbed; needs `site_frames` view first |
| `getIncident()` returns full incident | 🟡 sources exist, fn stubbed |
| `getWeeklyReport()` returns published or draft | 🔴 blocked on `weekly_reports` table |
| `submitSiteFrame()` writes a frame | 🟡 stub; target tables = `site_report_photos` + (TBD) parent `site_reports` row |
| `classifySeverity()` called at capture + at composer time | 🟡 pure fn ready; not invoked from any write path |
| `composeWeeklyReport()` called by cron | 🟡 pure fn ready; no cron + no persistence target |

### Agents — entire surface missing

The cabinet design assumes 4 agents:
- **incident-classifier** — refines `classifySeverity()` output with LLM (per `severity.ts` comment "LLM refines later via the incident-classifier agent")
- **captioner** — photo → suggested caption (mobile capture rule 4 says "voice narration", which captioner could complement or replace)
- **weekly-drafter** — wraps `composeWeeklyReport()` in a cron + writes to `weekly_reports`
- **site-supervisor** (cross-project copilot) — parallel to `concierge_handoff` in mig 0101 registry; ranks projects by attention urgency

**None of these are imported into this repo state.** That's a 4-agent gap before this cabinet ships.

### Vocab alignment

Design = "frames" (per-photo unit, storyboard scroll). Schema = "site_reports" (daily report) + "photos" (attachments under reports). The two need a reconciliation layer — recommend `site_frames` view that re-projects each `site_report_photos` row as a flat "frame" with the parent's metadata flattened in. Composer + storyboard would read this view; raw site_reports stay for backend ergonomics (daily aggregations, workforce logs).

### Mobile parity

Mobile capture is the cabinet's primary surface (field workers don't open desktop). Everything in section 03 is missing in code: camera capture, voice-to-text, GPS auto-write, offline queue. This is a large dev-side gap regardless of how much the design is polished.

---

## Recommended additions (prioritized)

### 🔥 P0 — ship before claiming "site supervisor complete"

1. **Add `weekly_reports` table** — `id · org_id · project_id · iso_week · status (draft/published) · hero_frame_ids (jsonb) · summary · kpis (jsonb) · excluded_jsonb · composed_at · composed_by_agent · published_at · published_by_user_id · pdf_url`.
2. **Add `site_frames` view** — flatten `site_report_photos` × parent `site_reports` × `site_report_zones`, expose: `id · org_id · project_id · zone · kind · severity · caption · taken_at · gps · spotlight_score · author_user_id`. Composer + storyboard read this view, not raw photos.
3. **Wire `submitSiteFrame()`** — writes to `site_reports` (parent row) + `site_report_photos` (per-frame), calls `classifySeverity()` at write time, requires GPS.
4. **Wire `getSiteDays()`** — reads `site_frames` view grouped by day, sorted `taken_at DESC`.
5. **Bring in the 4 agents** — `_repo/src/features/ai-agents/site-reports/{incident-classifier,captioner,weekly-drafter,site-supervisor}.ts`. Stub-shape OK for v1 (matches concierge audit pattern); real impl in Phase 2.6.
6. **Mobile capture flow components** — camera + GPS-required + (TBD) voice transcription. Without these the cabinet has no input mechanism.

### ⭐ P1 — Phase 2.6

7. **`safety_incident_signoffs` table** — `id · incident_id · role (foreman/pm/director) · signed_at · signed_by_user_id · note`.
8. **Cron for weekly-drafter agent** — Mon 09:00 per project, calls `composeWeeklyReport()`, persists to `weekly_reports`.
9. **PDF export from `weekly_reports`** — server-side React→PDF pipeline.
10. **Incident detail FSM** — `created → triaged → mitigated → closed` transition table on `safety_incidents`.
11. **Notify-stakeholders** — push to investor cabinet (P1 incidents), email to PM (P2), in-app only (P3/info).
12. **Add `site-supervisor` copilot to mig `ai_agents_registry`** — parallel pattern to `concierge_handoff` (cross-stay supervisor for concierge becomes cross-project supervisor for sites).
13. **Voice transcription helper** — could be Anthropic native (claude-haiku transcript) or Whisper. Decide.
14. **Lock Variant A** in design copy.

### 💭 P2

15. **Variant B (zone-grid)** documented as alternate, not built.
16. **Manual PM override** for weekly hero frames.
17. **Offline-first capture queue** for mobile field workers.

---

## Things outside scope

- BIM / drawing markup (separate Drawings sub-cabinet, mig 0054)
- Materials receiving (Procurement cabinet 15)
- Workforce attendance — `site_workforce_logs` exists but design treats this as data-source-only, not a primary surface

## Open questions for product

- **"Frame" vs "photo"** — should the materialised view be called `site_frames` (design vocab) or stay aligned to `site_report_photos` (DB vocab)? Recommend `site_frames` to keep the design copy honest.
- **Voice transcription provider** — Claude has voice input now (haiku-3.5 listens). Use it, or Whisper, or device-native? Suggest Claude haiku for consistency with rest of platform agent stack.
- **Captioner vs voice-narration** — both promised in design. Is captioner a fallback when voice fails? Or always-on suggestion? Suggest: voice is primary, captioner suggests as a chip the user can tap to accept.
- **Cost / schedule estimate provenance** — `classifySeverity()` accepts `estCostIdr` + `estScheduleDays`. Are these required from the field worker (mobile capture form) or filled by PM later? Suggest: optional in capture, prompted in incident detail.
- **GPS-missing exclusion strictness** — `composeWeeklyReport()` hard-excludes. Should there be a warn rather than exclude for milestone frames (where photo location is less critical)? Suggest: keep strict, surface a count in the excluded-list footer.
