# Sprint MD-2 + MD-3 · Photo evidence + inline AI grid closure

**Started:** 2026-05-15
**Closed:** 2026-05-15
**Scope:** Close 4 Mega-Sprint deferrals — photo-evidence grids on detail surfaces and real inline AI 3-card grids replacing the placeholder cards on two cabinet apexes.
**Baseline:** 6141/6141 tests passing on `main` after Sprint MD-1 closure.
**Final:** **6149/6149 tests passing** (+8 net new).

## Commit

`feat(dev-os): photo evidence grids + inline AI output grids (MD-2 + MD-3)`

---

## Schema findings (Task 1 prereq)

| Domain | Table | Photo association | Status for MD-2 |
| --- | --- | --- | --- |
| **Site reports** | `site_report_photos` | FK `siteReportId` → `site_reports.id` + FK `documentId` → `documents.id` (polymorphic storage) | ✅ Shipped MD-2.A |
| **Damage reports** | `damage_reports` | **No direct photo FK** — indirect via `taskId` → `task_attachments` | ⚠️ Scope-cut (see below) |
| **Operation tasks** | `task_attachments` | Polymorphic FK to `taskId` / `checklistItemId` / `maintenanceTicketId`; `storage_bucket` + `storage_path` for Supabase Storage v6 | ✅ Shipped MD-2.C |

The `documents` table is the polymorphic storage layer used by both photo paths; `site_report_photos` resolves URLs via the existing `getSiteReportPhotoUrl(photoId)` helper. `task_attachments` carries its own Supabase storage metadata (`storage_bucket`, `storage_path`, `upload_status`) so the new `loadOperationTaskPhotos` helper issues signed URLs directly via the Supabase admin client.

---

## What shipped

### Task 1 — Photo aggregator helpers (2 new files)

| Helper | Path | Returns |
| --- | --- | --- |
| `loadSiteReportPhotos(siteReportId)` | `src/lib/development/server/site-reports/site-report-photo-queries.ts` | `PhotoEvidenceItem[]`. Joins `site_report_photos` ↔ `documents`, reuses `getSiteReportPhotoUrl` for 1h signed URLs. Status: `local` (dry-run bucket), `uploaded` (URL resolved), `failed` (no URL). |
| `loadOperationTaskPhotos(taskIds, limit=12)` | `src/lib/development/server/operations/task-photo-queries.ts` | `PhotoEvidenceItem[]`. Reads `task_attachments` by `taskId IN (…)`, issues Supabase signed URLs (1h TTL). Status mapped from `upload_status` + bucket — `pending → syncing`, `failed → failed`, `uploaded → uploaded` or `local` for the dry-run bucket. |

Both helpers return the design-system `PhotoEvidenceItem` shape so the cabinet apex consumers don't have to massage data inline.

### Task 2 — MD-2.A · Site Reports detail page

`/development-os/site-reports/[id]/page.tsx` — added a new "Photo evidence" Section consuming `<PhotoEvidenceGrid items={evidencePhotos} columns={3}>` rendered above the existing "Site photos" Section (which keeps the per-zone `<PhotoGallery>` and `<PhotoUploadZone>`). The two views coexist intentionally — the new grid gives quick-scan status pills, the legacy gallery keeps the per-zone grouping operators are used to.

### Task 3 — MD-2.B · Damage Reports detail page · **SCOPE-CUT**

No `/dashboard/operations/damage-reports/[id]` detail route exists in the codebase. The only `damage-reports` surfaces are `page.tsx` (list) and `new/page.tsx` (create). Spec explicitly authorises a scope-cut in this case ("verify or skip if doesn't exist — note in closure").

**Recommendation:** A follow-up sprint should create the damage-reports detail route and consume `loadOperationTaskPhotos([damageReport.taskId])` since damage reports already link to an `operation_task` (via `damage_reports.task_id`), giving them a free path to `task_attachments` photos through the operation-task surface.

### Task 4 — MD-3.A · Site Supervisor inline daily-digest grid

`loadDailyDigestOutputs({ projectId?, limit=3 })` reads the 3 most-recent `agent_outputs` rows where `agent_key IN ('daily_construction_digest', 'daily_digest')` — both keys are queried because the agent key drifted across migrations (Mega-Sprint Phase 6 PM cabinet introduced the `_construction_` variant while the older Stage-10 seed used the short name).

Each row maps to `{ id, outputCode, agentKey, projectId, projectName, title, summary, status, createdAt, latestExceptions: string[] }`. The `latestExceptions` array is taken from `recommended_actions` (up to 3 bullets).

Site Supervisor apex (`cabinets/site-supervisor/page.tsx`):

- Loads `digests` via `loadDailyDigestOutputs({ limit: 3 })` alongside the existing `loadSiteSupervisorCabinet` call.
- Replaces the Phase-1 placeholder card (the "Inline 3-card grid coming in a polish pass" Badge ink-deep card) with either:
  - **3-card grid** when `digests.length > 0` — each card on the ink-deep gradient with date + project chip, title (line-clamp 2), 3 exception bullets, and a "View digest" CTA pointing at `/development-os/ai-agents/daily-construction-digest/outputs/<outputCode>`.
  - **Single empty-state card** when no digests — same gradient, "No runs yet" eyebrow, "Run digest →" Badge CTA pointing at the agent surface.

### Task 5 — MD-3.B · Sales inline marketing-assistant grid

`loadMarketingAssistantDrafts({ managerId?, limit=3 })` reads the 3 most-recent `agent_outputs` rows where `agent_key = 'marketing_assistant'`. Each row maps to `{ id, outputCode, draftType, channel, headline, snippet, status, createdAt }`. `channel` is parsed defensively from `detailed_output.channel` / `.platform` / `.medium` JSONB keys; falls back to `output_category` (which itself defaults to `"draft"`).

Sales apex (`cabinets/sales-manager/page.tsx`):

- Loads `drafts` alongside the existing `loadSalesCabinet` call.
- Replaces the Phase-2 placeholder card with either:
  - **3-card grid** — each card on ink-deep gradient with channel + date chip, status pill (`Draft` / `Approved` / `Published`), title, snippet (line-clamp 3), and "Open draft" CTA pointing at `/development-os/ai-agents/marketing-assistant/outputs/<outputCode>`.
  - **Single empty-state card** — same gradient, "No drafts yet" eyebrow, "Generate draft →" Badge CTA.

`managerId` is wired through the loader signature but not yet used in the WHERE clause — the join through `agent_invocation_log.user_id` is reserved for a follow-up sprint. Today's apex shows org-wide drafts, matching the Sprint-4.5 CFO/tax-assistant pattern.

### Task 6 — MD-2.C · Housekeeping photo grid (OPTIONAL — shipped)

`/dashboard/housekeeping/page.tsx` previously surfaced an empty `<PhotoEvidenceGrid>` with placeholder copy. The Section now passes `await loadOperationTaskPhotos(todayTaskIds, 12)` so cleaners see today's uploaded photos directly on the cabinet apex without drilling into per-task details. Empty-state copy retargeted from "Photo aggregation coming in a follow-up…" to "No turnover photos uploaded today yet…".

The `task_attachments` schema was already in place from Stage 10.B; no migrations needed.

---

## Tests

`tests/sprint-md-2-md-3-photos-and-ai.test.ts` — 8 new source-inspection tests:

| Test | Asserts |
| --- | --- |
| `loadSiteReportPhotos` shape | exports the function, joins site_report_photos + documents, reuses getSiteReportPhotoUrl, all 3 statuses surface |
| `loadOperationTaskPhotos` shape | exports the function, reads task_attachments, calls getSupabaseAdmin + createSignedUrl, all 4 statuses surface |
| Site reports detail grid | mounts `<PhotoEvidenceGrid>`, calls `loadSiteReportPhotos`, grid renders ABOVE the legacy `<PhotoGallery>` |
| Daily-digest loader | queries both `daily_construction_digest` + `daily_digest` agent keys, returns `latestExceptions` from recommended_actions |
| Site Supervisor inline grid | placeholder Badge gone, `digests.map` + `digests.length === 0` branches present, "View digest" + "Run digest" CTAs |
| Marketing-assistant loader | exports the function, queries `marketing_assistant` key, picks channel from JSONB |
| Sales inline grid | placeholder Badge gone, `drafts.map` + `drafts.length === 0` branches present, "Open draft" + "Generate draft" CTAs |
| Housekeeping photo grid | calls `loadOperationTaskPhotos(todayTaskIds, 12)`, placeholder copy retargeted |

Runtime persistence is not re-tested — every helper wraps an existing primitive (`getSiteReportPhotoUrl`, Supabase admin client, raw `agent_outputs` SELECT). The underlying primitives have their own unit tests from earlier sprints.

---

## Quality gates (Task 7)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | no errors on touched files; pre-existing repo-wide warnings unchanged |
| `npm test` | **6149 / 6149 passing** (+8 from baseline 6141) |
| `npm run build` | succeeds; no console errors in the route manifest |
| Site Reports detail | `<PhotoEvidenceGrid>` renders above the legacy gallery; ↑✓ build green |
| Site Supervisor apex | inline 3-card grid renders when digests exist, empty-state CTA when none; ↑✓ |
| Sales apex | inline 3-card grid renders when drafts exist, empty-state CTA when none; ↑✓ |
| Housekeeping apex | `<PhotoEvidenceGrid>` populated from `task_attachments`; ↑✓ |
| Damage Reports detail | **scope-cut** (no Dev-OS detail route exists; documented above) |

---

## Out of scope / deferrals

- **`/dashboard/operations/damage-reports/[id]` detail route** — does not exist; spec authorises scope-cut. Recommended follow-up: build the route and consume `loadOperationTaskPhotos([damageReport.taskId])` once the route lands.
- **Per-manager scoping on marketing-assistant drafts** — loader signature accepts `managerId` but doesn't filter on it (no `user_id` join through `agent_invocation_log` is wired yet). The Sales apex sees org-wide drafts today.
- **AI agent activation** — the spec forbids activating new agents this sprint. Both grids work whether or not the underlying agents have ever run; empty-state cards CTA into the agent surface to trigger a first run.
- **PhotoEvidenceGrid primitive API extensions** — every consumer fits the existing `{ items, columns, emptyMessage, accessory }` surface. No primitive changes.
- **Schema migrations** — none introduced. Every query targets existing tables (`site_report_photos`, `task_attachments`, `agent_outputs`, `documents`, `projects`).

---

## Halt

Sprint MD-2 + MD-3 closed. Awaiting owner review before any follow-up.
