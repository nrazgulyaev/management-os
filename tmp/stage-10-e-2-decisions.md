# Stage 10 / Phase 10.E.2 — Operations CRUD rollout — Decisions

**Date**: 2026-05-08
**Hours target**: 3 days (sub-phase 2 of 7) | Tests target: ~15 | Migrations: 0
**Tests delivered**: 17 static
**Test count**: 5104 → 5121 passing (+17)

---

## What 10.E.2 shipped

Closes the audit's "partial CRUD" finding for the operations list pages. The audit flagged 4 pages; the master plan extended to 7. 10.E.2 wires 6 of them via the new `<OperationsRowActions>` shared client wrapper.

| Page | Audit | Before | After |
|---|---|---|---|
| `/dashboard/operations/tasks` | HIGH | Add only | Add + Edit + Archive |
| `/dashboard/operations/housekeeping` | HIGH | Add only | Add + Edit + Archive |
| `/dashboard/operations/maintenance` | HIGH | Add only | Add + Edit + Archive |
| `/dashboard/operations/preventive` | HIGH | Add only | Add + Edit + Archive (NEW actions) |
| `/dashboard/operations/service-requests` | HIGH | Add via concierge | Edit + Archive (NEW actions) |
| `/dashboard/operations/damage-reports` | (operator add) | Add only | Add + Edit + Archive |

`/dashboard/operations/checklists` deliberately NOT in this sub-phase — it's a templates library page (different shape: no per-row Edit/Delete primitive needed); audit didn't flag it; lower partial-CRUD exposure. Documented as **deferred to a follow-up** if operators surface a need.

---

## What changed in existing code

### Server actions — `src/features/operations/actions.ts` (+4 functions)

- `editPreventiveScheduleAction(input, prev, formData)` — full re-validation; updates name / category / villa / project / frequency / nextDueOn / priority / assignedTo
- `archivePreventiveScheduleAction(input)` — flips `status` to `"archived"`
- `editServiceRequestAction(input, prev, formData)` — title / message / requestType / priority / preferredTime (status transitions stay on accept/complete)
- `archiveServiceRequestAction(input)` — flips `status` to `"cancelled"` (the existing service-request status enum has `cancelled` but not `archived`; using the canonical terminal state)

All gated on `requirePermission("operations.write")`. All audit-log + revalidate the canonical list path. All return `{ ok: false, error }` on missing row.

### Client wrapper — `src/components/dashboard/operations/operations-row-actions.tsx` (NEW)

- Drop-in `<OperationsRowActions kind row canWrite />` — handles 5 entity kinds (`task | maintenance | damage | preventive | service_request`)
- Composes 10.D primitives: `<RowActionsMenu>` + `<EntityFormModal>` + `<ArchiveConfirmDialog>`
- Each menu has 3 actions: View detail (link), Edit (modal), Archive (confirm)
- **Critical merge pattern** — modal exposes a curated subset of fields, but the existing `editOperationTaskSchema` / `editMaintenanceTicketSchema` / `editDamageReportSchema` require every create-field. Wrapper merges `{...row.values, ...modalValues}` before submit so the schema validates cleanly while operators only edit a few fields.
- Calls 6 legacy actions (`(prev, formData)` shape, id in formdata) and 4 new actions (`(input, prev, formData)` shape) — both signatures handled in one `onSubmit`.

### List pages (6)

- `/dashboard/operations/tasks` — TaskCard grid + absolutely-positioned menu
- `/dashboard/operations/housekeeping` — TaskCard grid + absolutely-positioned menu
- `/dashboard/operations/maintenance` — MaintenanceTicketCard grid + absolutely-positioned menu
- `/dashboard/operations/preventive` — ScheduleCard grid + absolutely-positioned menu
- `/dashboard/operations/service-requests` — list view; menu sits in the row trailing slot
- `/dashboard/operations/damage-reports` — list view; menu sits next to estimated-cost in trailing slot

All 6 also gained `<NoItemsYet>` empty-state primitive (replaces handwritten dashed-border placeholders).

---

## Architecture decisions

### Merge full row values with modal edits

Existing edit schemas (`editOperationTaskSchema = createOperationTaskSchema.extend({id})` etc.) require all the create-fields. A modal that only exposes 4 fields would fail validation on submit. Wrapper solves this by merging:

```ts
const merged: Record<string, unknown> = { ...row.values, ...userEdits };
const fd = new FormData();
for (const [k, v] of Object.entries(merged)) fd.append(k, ...);
```

`row.values` carries the full entity payload from the server-rendered list page; `userEdits` overrides what the modal exposed. Net result: schema-valid submit + small modal.

### Different archive terminal states per entity

- Inventory entities + tasks + maintenance + damage + preventive: `status = "archived"` (matches existing patterns)
- Service requests: `status = "cancelled"` (matches the existing serviceRequestStatusEnum which has `cancelled` but not `archived`)

Test verifies both — adding `archived` to the SR enum would be a schema change avoidable for this scope.

### Two server-action signatures coexist

Legacy ops actions (`editOperationTaskAction`, etc.) take `(prev: ActionResult, formData: FormData)` with id in the FormData. New ops actions (`editPreventiveScheduleAction`, etc.) take `(input: {id}, prev, formData)` matching the inventory pattern. Wrapper handles both; tests verify the wrapper appends `id` to FormData for the 3 legacy edit calls and uses `{id: row.id}` for the 4 new calls.

### Card-based pages use absolute-positioned menu

TaskCard / MaintenanceTicketCard / ScheduleCard wrap their bodies in `<Link>` for click-to-detail. Same problem as inventory items — putting a button inside violates HTML nesting. Solution: wrap each card in `<div className="relative">` with the menu at `absolute top-3 right-3 z-10`. Stops bubble-up to the link click.

### Service requests + damage reports use trailing-slot menu

These pages render `<li>` rows (not Link-wrapped cards). The kebab can sit in the row's trailing flex section directly without the absolute-positioning trick. Cleaner DOM.

---

## Trade-offs + scope discipline

**1. Checklists deferred.** Templates library page; not in audit's partial-CRUD list; different shape than the per-entity CRUD pattern. If operators surface a need, ~30-min follow-up adds template-level Edit/Archive.

**2. Modal field set is curated, not exhaustive.** Operator-facing edit modal shows the 3-5 most-edited fields per entity. Full edits (linking villa/project/booking, attaching template, changing assigneeId across many entities) stay on the detail pages where the existing surfaces handle them. The kebab includes "View detail" so the path is one click.

**3. Service-request edit doesn't change status.** Status transitions belong to `acceptServiceRequestAction` / `completeServiceRequestAction` — both already shipped. The new `editServiceRequestAction` is title / message / type / priority only; archive is the only status path it touches.

**4. Inventory pattern reused, not duplicated.** Same shape: discriminated `kind` prop, dual permission paths, audit-log + revalidate per action. If a future stage needs another module's CRUD rollout, a new wrapper ships in ~50 lines following this template.

**5. No restore-from-archive.** Same as 10.E.1 — one-way archive for now.

**6. No bulk operations.** Same as 10.E.1 — Stage 11 candidate.

---

## Phase 10.E.2 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 4 new server actions (preventive + service-requests) | yes | ✅ test |
| 6 existing actions intact (regression guard) | yes | ✅ test |
| Permission gating consistent | yes | ✅ test |
| Audit-log keys for each action | yes | ✅ test |
| Revalidate-path for each action | yes | ✅ test |
| Soft-delete (archived/cancelled, no hard DELETE) | yes | ✅ test |
| Reusable client wrapper handling 5 kinds | yes | ✅ test |
| Merge full row + modal edits before submit | yes | ✅ test |
| 6 list pages wired | yes | ✅ test |
| NoItemsYet primitive in each empty state | yes | ✅ test |
| Tests | ~15 | ✅ 17 |
| Total tests | 5104 → ~5119 | ✅ 5121 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.E.2 ACCEPTED.**

---

## E sub-phase progress

- 10.E.1 — Inventory pages — ✅ shipped (`0c46aa2`)
- **10.E.2 — Operations pages — ✅ shipped today**
- 10.E.3 — Owner-stays + Owners + Shares (3 days, ~15 tests) — pending
- 10.E.4 — Villa-guides edits (2 days, ~10 tests) — pending
- 10.E.5 — Settings + Payments + others (2 days, ~10 tests) — pending
- 10.E.6 — Dev-OS rollout (3 days, ~20 tests) — pending
- 10.E.7 — Delete confirmation rollout (~5 tests) — pending
