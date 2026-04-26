# ADR-0006 — Operations Runtime (v4)

Status: Accepted · 2026-04-25

## Context

Arconique's premium villa operation depends on consistent housekeeping,
maintenance, inspections, and guest service execution across three Bali
projects (Eternal Villas, Enso, Ahau). v3.5 closed the finance loop with
investor-grade statements, but the operations side was still served by mock
data on `/dashboard/operations` and `/field`.

Version 4 ships a real operations runtime: tasks, checklists, maintenance
tickets, preventive schedules, damage reports, attachments metadata, and a
service-request foundation. It deliberately stops short of booking
integrations, IoT lock/camera control, and AI auto-routing — those layers
build on top of this contract.

## Decisions

### 1. Single unified task ledger

`operation_tasks` is the canonical task table for every category
(`housekeeping | maintenance | inspection | guest_request | procurement |
admin`). One ledger keeps reporting honest, makes assignment uniform, and
lets cross-cutting features (audit, RLS, escalation) live in one place
instead of being duplicated across category-specific tables.

`task_code` follows the readable `OPS-YYYYMMDD-NNNN` shape (counters minted
per day in `nextDailyCounter`). Maintenance tickets and service requests
follow `MNT-…` and `SR-…` respectively. Codes survive in URLs, audit
messages, and field clipboards without exposing UUIDs.

### 2. Lifecycle as a closed transition table

Statuses live in three guarded transition tables in
`features/operations/scheduling.ts`:

- `TASK_TRANSITIONS` — open / scheduled / in_progress / blocked /
  needs_review / completed / approved / cancelled.
- `MAINTENANCE_TRANSITIONS` — open / triaged / scheduled / in_progress /
  waiting_parts / resolved / closed / cancelled.
- `SERVICE_REQUEST_TRANSITIONS` — new / accepted / scheduled / in_progress /
  completed / cancelled.

`canTransition(table, from, to)` is the single guard. Server actions reject
transitions that aren't in the table; the same predicate runs in tests.

### 3. Checklists as instantiated copies of templates

`checklist_templates` + `checklist_template_items` is the catalog;
`task_checklists` + `task_checklist_items` is the per-task instance. When a
task picks up a template, items are *copied* — section, label, item_type,
required, sort_order, photo_required (derived from `photo_required` item
type). The instance is independent of subsequent template edits, which is
the only way to keep historical evidence stable.

Completion is gated by `evaluateChecklistReadiness(items)`. Required items
must be `done`, `failed`, `skipped`, or `not_applicable`. A `done` item with
`photo_required = true` requires an attachment (currently treated as
satisfied; tightens once attachment storage lands).

Lifecycle: open → in_progress (first edit) → completed (`completeChecklist`)
→ approved (`approveChecklist` by a supervisor with
`operations.approve`).

### 4. Preventive schedules

`preventive_schedules` defines recurring work (frequency: daily / weekly /
biweekly / monthly / quarterly / yearly / custom). The action
`generateDuePreventiveTasksAction()` materialises tasks for every active
schedule whose `next_due_on <= today`. After generation it advances
`last_generated_on = today`, `next_due_on` via `computeNextDueOn(...)`. The
helper is calendar-day, UTC-anchored, and clamps month-end overflow (Jan 31
+ 1 month = Feb 28/29).

`monthly` adds one calendar month; `quarterly` adds three; `yearly` adds
twelve. `custom` requires `interval_days > 0`. Re-running on the same day
is a no-op.

### 5. Permissions

The matrix in `features/auth/permission-matrix.ts` adds:

- `operations.read / write / assign / approve`
- `housekeeping.read / write`
- `maintenance.read / write`
- `service_request.read / write`

`housekeeper`, `technician`, and `security` joined `INTERNAL_ROLES`.
`housekeeping_supervisor` is the canonical approver for cleaning checklists;
`operations_manager` and `property_manager` cover assignment + approval
across the broader catalog.

### 6. RLS strategy

Every operations table is `ENABLE` + `FORCE` RLS. Read policies are wired
through `is_internal_user()` (defined in 0000) for staff. `operation_tasks`,
`task_checklists`, and `task_checklist_items` carry an additional
`assigned_self_read` policy so field staff (housekeeper, technician — not in
`is_internal_user`'s allow-list) can read tasks assigned to them via
`auth.uid() → app_users.id`.

Writes are intentionally not policy-permitted from the public role. All
mutations go through server actions backed by the service-role connection,
which already centralises permission checks via `requirePermission(...)`.
This keeps the RLS surface narrow until we open up direct PostgREST
access in v6.

### 7. Code generation

`buildTaskCode(counter, now)` and friends produce
`PREFIX-YYYYMMDD-NNNN`. Counters come from `nextDailyCounter(prefix)` which
runs `COUNT(*)` against the day's existing rows; not strictly atomic under
high concurrency, but adequate for an operations team writing dozens of
tasks per day. A random-suffix variant exists for callers without a
counter.

### 8. Attachments

`task_attachments` is metadata-only for v4. The `attachment_type` enum and
join columns to `operation_tasks`, `task_checklist_items`, and
`maintenance_tickets` already cover the data model; storage (Supabase
Storage / signed URLs) lands in v5 alongside guest-facing photo capture.

## What's implemented now

- Migration `drizzle/0005_operations_runtime.sql` (idempotent re-run).
- Drizzle schema `src/lib/db/schema/operations.ts` + barrel export.
- Pure helpers: `codes.ts`, `scheduling.ts`, `checklists.ts`.
- Zod schemas in `src/features/operations/schema.ts`.
- Read services + aggregate metrics in `src/features/operations/services.ts`.
- Server actions in `src/features/operations/actions.ts` (audit-logged).
- UI components in `src/components/operations/` (pills, cards, runner,
  metrics, schedule card, forms, action bars).
- Admin routes:
  - `/dashboard/operations` — command center with metrics and previews.
  - `/dashboard/operations/tasks`, `/tasks/new`, `/tasks/[id]`.
  - `/dashboard/operations/housekeeping` (alias-routes to task detail).
  - `/dashboard/operations/maintenance`, `/new`, `/[id]`.
  - `/dashboard/operations/preventive`, `/new` + manual "generate due" CTA.
  - `/dashboard/operations/checklists` (template library).
  - `/dashboard/operations/service-requests`, `/[id]`.
  - `/dashboard/operations/damage-reports`, `/new`.
- Field staff workflow:
  - `/field` reads live `listTasksForCurrentStaff()` with mock fallback.
  - `/field/tasks/[id]` runs the live checklist with field-sized tap targets.
  - `/field/tasks/demo` retains the UX walkthrough, marked clearly as demo.
- Seed data: 7 task types, 5 checklist templates with realistic items, 5
  sample tasks (mixed status/priority), 3 maintenance tickets, 4 preventive
  schedules, 3 service requests, 2 damage reports.
- Tests: status transitions, scheduling math, code generation, checklist
  readiness rules, schema validations, permission matrix, migration shape.

## What's deferred

- Attachment storage (signed-URL upload). Today the metadata table exists
  but no upload flow is wired.
- WhatsApp / Telegram / SMS notifications.
- Booking-platform-driven auto-creation of turnover tasks (will land
  alongside booking integrations).
- Smart-lock / camera bridges for guest service requests.
- AI runtime: triage, smart routing, escalation.
- Native mobile shell (PWA + offline checklist sync).
- Guest-portal service-request UI: the table and server action exist, but
  the customer-facing form stays in a follow-up version so we don't expose
  any internal surface accidentally.
- Tighter checklist photo-attachment enforcement (today
  `evaluateChecklistReadiness` accepts `done` items as satisfied — the
  guard becomes strict once the attachment upload lands).

## Migration / seed

```bash
npm run db:migrate    # applies 0005_operations_runtime.sql
npm run db:seed       # upserts task types, templates, tasks, tickets,
                      # schedules, requests, damage reports
```

Re-runs are idempotent on both fronts.

## Risks

- `nextDailyCounter` is COUNT-based — under heavy concurrent writes a small
  race window exists. Operations volume makes it a non-issue for v4; v5
  will replace it with a per-day sequence if the audit log shows duplicate
  attempts.
- The `assigned_self_read` RLS policies depend on `auth.uid() → app_users`
  being populated. Field staff who haven't been linked through
  `/setup/admin-bootstrap` (or had a row pre-provisioned) won't see live
  tasks. The `/field` page falls back to a single demo card to make this
  observable.
- The unified `operation_tasks` table will require careful denormalisation
  pressure as analytics demands grow; today the indexes (status, category,
  villa, assignee, due_at, scheduled_for, priority) cover the operational
  queries we run.
