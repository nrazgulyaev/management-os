# Comparative Functional Audit — Management: Operations, Housekeeping & Field

Cluster scope: `src/app/(dashboard)/dashboard/{operations, housekeeping, maintenance-intelligence, readiness, tasks, security, utilities}` + Field app `src/app/(field)/field/`.
Date: 2026-07-02. Method: static read of pages, server actions, AI agents, offline queue + service worker. Cross-tenant NOT re-audited (covered by prior sweeps #273–302).

Headline: this cluster is **substantially real and well-built** — the core operational loop (tasks → checklists → completion → approval, maintenance tickets, preventive schedules, turnover board, maintenance-intelligence plans/windows/risks, readiness) is genuinely wired with permission gates, audit events, and state-machine transitions. Two confirmed stubs/gaps: the **turnover-monitor AI agent** (known stub) and the **offline field-photo drain** (photos queue to IndexedDB but are never uploaded).

---

## (A) Functional Status Table

| Area | Status | Evidence (file:line) |
|---|---|---|
| Operation task lifecycle (create/status/assign/approve/edit/archive) | WORKS | `src/features/operations/actions.ts:75,143,212,263,1211,1297` — real transitions via `TASK_TRANSITIONS`, lifecycle timestamps, audit |
| Checklist templates (add/edit/delete/instantiate) | WORKS | `actions.ts:319,362`; page `operations/checklists/page.tsx:5,27,57` (AddButton + RowActions wired) |
| Checklist runner (item update / complete / approve + photo-required gate) | WORKS | `actions.ts:409,491,583`; photo gate counts real uploaded attachments `actions.ts:529-552` |
| Maintenance tickets (create/status/edit/archive) | WORKS | `actions.ts:693,745,1359,1435` — `MAINTENANCE_TRANSITIONS`, org-anchor resolver |
| Preventive schedules (create + generate-due, idempotent per day) | WORKS | `actions.ts:800,857` — `computeNextDueOn`, `lastGeneratedOn` guard, real task materialization |
| Maintenance-intelligence templates/plans/windows/risks | WORKS | `src/features/maintenance-intelligence/actions.ts:68,206,337,366,450,594,637,668` — plans→tasks→calendar blocks, window suggestions, batch generate |
| Service requests (create + accept/complete/cancel) | WORKS | `actions.ts:958,1007,1068` — `SERVICE_REQUEST_TRANSITIONS` |
| Damage reports (create/edit/archive/resolve) | WORKS | `actions.ts:1157,1486,1554,1609` — full open→review→{repaired/charged/waived} lifecycle |
| Readiness (set villa readiness state) | WORKS | `src/features/readiness/actions.ts:12` — org-gated, audited |
| Turnover board (status persistence + manual assign) | WORKS | `src/features/operations/turnover-actions.ts:62,123` — drag-to-column persist, cleaner picker |
| Turnover auto-generation from bookings (checkout→clean) | WORKS (minor gap) | `src/features/operations/turnover-queries.ts:68,147-178` — `deriveTodaysTurnovers` on board load, idempotent. Gap: only derives when table empty for the day (see D-3) |
| **turnover-allocator** AI agent (least-loaded assignment) | WORKS | `src/features/ai-agents/operations/turnover-allocator.ts:47` — real DB read/write around pure `allocateTurnovers()`, 90s cron |
| **turnover-monitor** AI agent (SLA-breach alerts) | **MOCK (stub)** | `src/features/ai-agents/front-office/turnover-monitor.ts:21-23` — `run()` returns `{ alerts: [] }`; header says "Today: stub" |
| Field app — task detail + checklist runner + material usage | WORKS | `src/app/(field)/field/tasks/[id]/page.tsx:57` — real task, entity-scoped to assignee/supervisor, ChecklistRunner variant="field" |
| Field app — ONLINE photo evidence upload | WORKS | `field/tasks/[id]/page.tsx:161-172` — `AttachmentUploader` + `AttachmentGallery` (real /attachments registry) |
| Field app — OFFLINE photo capture drain (queue→upload) | **BROKEN/PARTIAL** | queued at `field-capture-block.tsx:83`, but SW `syncOfflineQueue()` (`public/sw.js`) drains only the "queue" store, never the "photos" store; `getPendingPhotos()` (`offline-queue.ts:172`) has ZERO consumers (see D-1) |
| Housekeeping cabinet apex (KPIs, photo evidence, patrol timeline) | WORKS (AI placeholder) | `src/app/(dashboard)/dashboard/housekeeping/page.tsx:205,347` — real photos via `loadOperationTaskPhotos`; "housekeeping-scheduler — coming soon" AI placeholder `:224` (see D-2) |
| Operations brief (daily team markdown export) | WORKS | `operations/brief/route.ts:24` — real KPIs/tickets/arrivals/departures markdown (replaced ComingSoon stub) |
| Tasks page (`/dashboard/tasks`, CRM tasks) | WORKS | `tasks/page.tsx:102` — `NewTaskButton` wired; tab driver `_tasks-client.tsx` real |
| Utilities account 12-month trend chart | PARTIAL (labelled) | `utilities/accounts/[id]/page.tsx:359-361` — bar heights are a "muted stub" (honest placeholder, self-labelled) |

Counts: **WORKS 18 · PARTIAL 2 · MOCK/stub 1 · BROKEN 1** (~22 surfaces audited).

---

## (B) Defects, Prioritized (file:line)

### D-1 — P0: Offline field-photo capture never uploads (silent data loss)
`src/components/field/field-capture-block.tsx:83` queues photos via `queueOfflinePhoto()` and the UI tells the worker "Photos are saved to your device first + uploaded automatically" (`:195`). But:
- `public/sw.js` → `syncOfflineQueue()` iterates only the **"queue"** (actions) object store via `getQueueItems()`; it never opens the **"photos"** store.
- `src/lib/development/client/offline-queue.ts:172` `getPendingPhotos()` has **zero consumers** anywhere in the codebase.
Result: a cleaner who captures turnover photos on a flaky/offline link sees "queued, will sync", but the photos are stranded in IndexedDB forever and never reach `/attachments`. This is the exact evidentiary-chain feature Turno/Breezeway lead on. Online path (`AttachmentUploader`) is fine — so the bug is masked for connected users. **Fix: add a photo-drain loop to the SW that reads the "photos" store and POSTs each blob to the attachments upload endpoint, deleting on 2xx.**

### D-2 — P1: turnover-monitor agent is a stub (no SLA breach alerts)
`src/features/ai-agents/front-office/turnover-monitor.ts:21` `run()` returns `{ alerts: [] }`. The registry runs it every minute but it produces nothing. Competitors (Turno problem-reporting, Breezeway dynamic workflows) alert when a clean is behind vs the next check-in. **Fix: implement the "next check-in < 30min AND cleaning < 100%" scan against turnover rows + checklist progress; header already specs it.** Also `/dashboard/housekeeping` shows an explicit "housekeeping-scheduler — coming soon" AI placeholder (`page.tsx:224`) — same class of unbuilt agent.

### D-3 — P2: Turnover derivation only fires when the day's table is empty
`src/features/operations/turnover-queries.ts:74-77` calls `deriveTodaysTurnovers` **only if `rows.length === 0`**. If any turnover exists for today, a checkout booking added later in the day won't materialize a turnover card until tomorrow. `ON CONFLICT DO NOTHING` already makes the INSERT safe to run every load, so the `=== 0` guard is an unnecessary correctness gap. **Fix: always run the derive (it's idempotent), or trigger derivation on booking create/checkout instead of lazily on board read.**

(Minor, non-defect: utilities trend chart `utilities/accounts/[id]/page.tsx:361` is an honestly-labelled visual stub — not a functional defect.)

---

## (C) Competitor Gap Table

Benchmarks: **Breezeway** (property-care ops + inspections), **Turno/TurnoverBnB** (cleaning scheduling + marketplace), **Fieldwire** (field task mgmt).

| Capability | Us | Breezeway | Turno | Fieldwire | Verdict |
|---|---|---|---|---|---|
| Task auto-assignment from bookings | Turnovers derived from same-day checkout + allocator assigns least-loaded cleaner | Auto-schedule by reservation times + custom rules | Auto-generate cleaning projects from calendar sync | (plan-pinned, manual) | **PARITY** (see D-3 lazy-trigger caveat) |
| Cleaner mobile app | Field PWA: task, checklist, materials, online photo, geo check-in | Native iOS/Android | Native cleaner app | Native iOS/Android + offline | **PARITY** on features; **GAP** = PWA not native, and offline photo drain broken (D-1) |
| Checklists + photo verification | Templates, per-item photo-required gate enforced on complete | Custom checklists per unit | Room-by-room + photo proof | Checklists + photos on plans | **PARITY** |
| Inspections | Checklist runner covers it; no distinct "inspection" object/flow | First-class inspection workflows + auto-notify | Photo verification | Inspection request forms | **GAP** — no dedicated inspection entity/hand-off |
| Maintenance / work orders | Full ticket lifecycle + severity + owner-chargeable | Maintenance tasks in dashboard | Problem-reporting → external contact | Work orders / RFIs | **PARITY** (+ owner-chargeable is a DIFFERENTIATOR) |
| Preventive maintenance schedules | Real: preventive schedules + maintenance-intelligence plans → tasks + calendar blocks | Auto by date/occupancy | (limited) | (n/a) | **DIFFERENTIATION** — deeper than all three |
| SLA/behind-schedule alerts | turnover-monitor **stub** (D-2) | Dynamic workflow notifications | In-app status + problem alerts | Real-time task status | **GAP** |
| Cleaner marketplace + auto-pay | None | Some | **Core** (bids, vetted cleaners, auto-pay) | None | **GAP** — no marketplace/payments (likely out of scope: internal-staff model) |
| Offline-first field sync | Queue exists; photo drain broken (D-1) | Yes | Yes | **Full offline + auto-sync** | **GAP** until D-1 fixed |
| Maintenance-intelligence (window suggestions, risk events) | Yes — suggest windows respecting occupancy, risk acknowledge/resolve | (implicit) | No | No | **DIFFERENTIATION** |

---

## (D) Recommendations (priority order)

1. **P0 — Fix offline photo drain (D-1).** Highest user-visible risk: silent loss of turnover evidence photos. Small, contained fix in `public/sw.js` + wire `getPendingPhotos()`. Restores offline parity with Turno/Breezeway/Fieldwire.
2. **P1 — Implement turnover-monitor (D-2).** Spec is already written in the stub header; needs a scan of turnover rows vs checklist completion vs next check-in. Unlocks the "clean is behind" alert that is table-stakes for all three competitors.
3. **P1 — Ship the housekeeping-scheduler agent** (currently "coming soon" placeholder on `/dashboard/housekeeping`) to close the AI-ops story.
4. **P2 — Make turnover derivation eager (D-3):** always run the idempotent derive, or trigger on booking checkout, so late-added checkouts appear same-day.
5. **P2 — Add a first-class Inspection flow** (distinct from generic checklists) with auto-notify on clean-complete — the one clear Breezeway feature with no equivalent here.
6. **P3 — Replace the utilities trend-chart visual stub** with real monthly reading aggregation (labelled, low urgency).
7. **Consider (scope call):** cleaner marketplace + auto-pay is Turno's moat but likely outside the internal-staff operating model — defer unless the product targets 3rd-party cleaner networks.

Strengths to preserve: owner-chargeable maintenance/damage attribution and the maintenance-intelligence window/risk engine are genuine differentiators none of the three benchmarks match.
