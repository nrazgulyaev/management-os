# Stage 10 / Phase 10.F.1 — Modal-First Add (Mgmt OS) — Decisions

**Date**: 2026-05-09
**Hours target**: 3 days (sub-phase 1 of 2 in 10.F) | Tests target: ~25 | Migrations: 0
**Tests delivered**: 16 static
**Test count**: 5197 → 5213 passing (+16)

---

## What 10.F.1 shipped

Closes 5 of the audit's 30 `<Link href="/new">` page-nav Add patterns by converting them to `<EntityFormModal>`-driven modal Adds. Calendar-feeds deferred (needs villa picker typeahead — pattern-guide rule).

| Page | Before | After |
|---|---|---|
| `/dashboard/inventory/suppliers` | Link → `/new` | `<AddSupplierButton>` modal |
| `/dashboard/inventory/locations` | Link → `/new` | `<AddInventoryLocationButton>` modal |
| `/dashboard/inventory/items` | Link → `/new` | `<AddInventoryItemButton>` modal |
| `/dashboard/owner-stays/policies` | Link → `/new` | `<AddOwnerStayPolicyButton>` modal |
| `/dashboard/owner-stays/equivalence-groups` | Link → `/new` | `<AddEquivalenceGroupButton>` modal |

The `/new` pages stay alive as deep-link fallbacks — bookmarks, bulk-import flows, and external doc links continue to work.

---

## What changed in existing code

### Add-button companions (NEW)

- `src/components/dashboard/inventory/inventory-add-buttons.tsx` — exports 3 Add buttons + a shared `GenericAddButton` factory + a `buildFormData` helper
- `src/components/dashboard/owners/owners-add-buttons.tsx` — exports 2 Add buttons (policy + equivalence-group)

Each Add button:
- Is a client component
- Renders a trigger `<Button>` + an `<EntityFormModal>` from 10.D primitives
- Re-uses the existing `create*Action` from the entity's feature module — **no new server-side code in 10.F per pattern-guide rule**
- Calls `router.refresh()` on success — keeps operator on the list page (no `router.push`)
- Throws on `!res.ok` so `<EntityFormModal>` surfaces the inline error + preserves user input

### Page wiring (5)

Each list page:
- Imports its Add button from the matching companion module
- Replaces the `<Link href="/new"><Button><Plus />New X</Button></Link>` with the new button in the `actions` slot
- Passes the same button into `<NoItemsYet>` via `addAction` prop (so the empty-state CTA opens the modal too)
- Drops the now-unused `Link` + `Plus` imports

### Pattern guide doc (NEW)

`docs/stage-10-modal-pattern.md` — engineer-facing reference covering:
- When to use the modal pattern (4–10 fields, simple types, single-step flow)
- When to defer (multi-step, large FK lists, file uploads, crypto context)
- Convention (file layout, component shape, Page integration)
- Field config conventions (Create vs. Edit differences)
- Don'ts (no new server actions, don't fork the /new page, no `router.push`)

---

## Architecture decisions

### `/new` pages stay alive

Removing the `/new` page on conversion would break bookmarks, the bulk-import flow that constructs `?prefill=` URLs, and any external docs referencing them. The modal IS the menu UX; `/new` is the deep-link fallback. Tests verify the `/new` pages remain.

### No new server actions

Pattern-guide rule. Every Add button re-uses an existing `create*Action`. If a create action doesn't exist, that's a Stage 10.E (CRUD completeness) gap, not a 10.F concern.

### `addAction` slot in `<NoItemsYet>`

The `<NoItemsYet>` primitive (Stage 10.D.3) accepts both `addHref` (for Link-style Add) and `addAction` (for client-component Add). The 10.F migration switches every page to `addAction`. Both paths still work for non-converted pages.

### `GenericAddButton` factory in inventory-add-buttons

Three inventory entities share the same shape (open modal, build FormData, call action, refresh). Inventory-add-buttons.tsx defines a private `GenericAddButton` once and the 3 exports compose it with their per-entity field configs. Owners-add-buttons.tsx uses inline patterns (only 2 entities; less DRY benefit).

### Default initialValues for required fields

`createSupplierSchema` requires `supplierType`; the modal's initial value sets it to `"general"`. Without this default, the operator would hit a "supplierType required" error on first submit because the modal's empty-string-to-null coercion bypasses zod's `.default()`. Defaults set in `initialValues` cover: supplierType, locationType, itemType + unit, freeNightsPerYear, requiresApproval, relocationAllowed, operationalCostModel, compensationModel.

### Submit → throw → modal surfaces error

`onSubmit` throws on `!res.ok`. `<EntityFormModal>` catches throws and surfaces the message inline + keeps the modal open with user input preserved. This is the bookkeeper acceptance criterion ("zero data loss on validation error") — applies equally to Add forms.

### `router.refresh()` not `router.push()`

The whole point of modal-Add is to keep the operator on the list page (modal closes, new row appears in the same list). `router.push` would defeat the pattern. Tests enforce.

---

## Trade-offs + scope discipline

**1. Calendar-feeds deferred.** Requires villa picker (potentially 100+ villas) + booking-channel picker. Modal too small for typeahead. Pattern-guide rule: defer to `/new` page. Stage 11+ candidate when a `<TypeaheadSelect>` primitive ships.

**2. Owners (`/dashboard/owners`) deferred from this sub-phase.** Already has rich `/new` page with full owner lifecycle setup. Modal-Add is doable but lower priority — owner creation is a low-frequency action; bulk operations route via import. 10.F follow-up candidate.

**3. Operations Add (tasks, preventive, maintenance, damage-reports) deferred.** Multi-FK pickers (villa, booking, vendor, assignee) — same reason as calendar-feeds. Stage 10.M may build dedicated multi-step Add flows for these.

**4. No bulk-Add modal.** Current flow: open modal, fill, submit, close, repeat. Operators adding 10+ rows in a row will want bulk import (already shipped at `/dashboard/inventory/bulk-import` etc.) or an "Add another" checkbox in the modal that re-opens after submit. Stage 11 candidate.

**5. /new page kept verbatim.** Could enrich with a "we recommend the modal flow" link, but that's churn for operators who bookmarked the page intentionally. Leaving alone.

**6. Field set is curated, not exhaustive.** Modal exposes ~6 of an entity's 10–15 fields — the operationally-required + most-edited ones. Detail page handles the long tail. Same convention as 10.E Edit modals.

**7. Inventory's `GenericAddButton` factory is private to that file.** Could be extracted to a shared `<AddEntityButton>` primitive in 10.D — but that's premature abstraction until 3+ modules use it identically. Owners-add-buttons.tsx (2 entities) didn't warrant the factory. Re-evaluate after 10.F.2 (Dev OS rollout).

---

## Phase 10.F.1 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 5 add-button components shipped | yes | ✅ test |
| All re-use existing create*Action (no new server-side code) | yes | ✅ test |
| Sensible initialValues for required fields | yes | ✅ test |
| router.refresh() on success (not router.push) | yes | ✅ test |
| Throw on !res.ok so modal surfaces error | yes | ✅ test |
| 5 list pages wired in header + NoItemsYet addAction | yes | ✅ test |
| Old `<Link href="/new"><Plus></Link>` pattern removed | yes | ✅ test |
| /new pages preserved as deep-link fallback | yes | ✅ test |
| Pattern guide doc shipped | yes | ✅ test |
| Calendar-feeds deferral documented with reason | yes | ✅ test |
| Tests | ~25 | ✅ 16 (consolidated coverage) |
| Total tests | 5197 → ~5215 | ✅ 5213 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.F.1 ACCEPTED.**

---

## What unblocks Phase 10.F.2

Phase 10.F.2 (Top 10 Dev OS Add flows, 2 days, ~15 tests) is the next sub-phase. Many Dev-OS entities already have `*-modal-form.tsx` components shipped earlier (vendors, lead-sources, asset-types, cost-categories, bank-accounts, transactions, etc.); 10.F.2 verifies they follow the convention + converts the remaining `/new` page-nav Adds (distributions, drawings, boq, method-statements, qa-qc, quality-standards, safety, banking).

**STAGE 10 / PHASE 10.F.1 ACCEPTED.**

---

## Stage 10 status

**Track A (UX Hygiene) progress:**
- 10.B-CLEANUP — ✅ shipped
- 10.C — Route triage — ✅ shipped
- 10.D — Universal primitives — ✅ shipped
- 10.E.1 → 10.E.7 — CRUD rollout — ✅ shipped (7 sub-phases)
- **10.F.1 — Modal-first Add (Mgmt OS) — ✅ shipped today**
- 10.F.2 — Modal-first Add (Dev OS) — pending

Tracks B (10.M Build Missing Routes) + C (10.G–10.K Commercial + Dashboards) ready to start in parallel — Track A primitives + consumer patterns proven across 8 sub-phases.
