# Stage 10 / Phase 10.E.1 — Inventory CRUD rollout — Decisions

**Date**: 2026-05-08
**Hours target**: 5 days (sub-phase 1 of 7) | Tests target: ~20 | Migrations: 0
**Tests delivered**: 21 static
**Test count**: 5084 → 5105 passing (+21)

---

## What 10.E.1 shipped

Closes the audit's "partial CRUD" finding for the 4 inventory list pages flagged HIGH-severity:

| Page | Before | After |
|---|---|---|
| `/dashboard/inventory/suppliers` | Add only | Add + Edit + Archive |
| `/dashboard/inventory/locations` | Add only | Add + Edit + Archive |
| `/dashboard/inventory/categories` | (no Add) | Edit + Archive (key locked) |
| `/dashboard/inventory/items` | Add only | Add + Edit + Archive |

The audit also flagged `/dashboard/inventory/movements` — intentionally NOT touched. Movements are event-sourced; reverse via a counter-movement, never edit/delete. Documented in the wrapper file.

---

## What changed in existing code

### Server actions — `src/features/inventory/actions.ts` (+8 functions)

- `updateSupplierAction(input, prev, formData)` — re-uses `createSupplierSchema`, full upsert semantics
- `archiveSupplierAction(input)` — flips `status` to `"archived"`, audit-logs `inventory.supplier.archive`
- `updateInventoryLocationAction` + `archiveInventoryLocationAction`
- `updateInventoryCategoryAction` + `archiveInventoryCategoryAction`
- `updateInventoryItemAction` + `archiveInventoryItemAction`

All gated on the same `requirePermission` calls as the corresponding `create*Action`. All revalidate the canonical list path. All audit-log with the entity-typed action key.

### Client wrapper — `src/components/dashboard/inventory/inventory-row-actions.tsx` (NEW)

Drop-in `<InventoryRowActions kind="supplier|location|category|item" row={row} />` — renders a `<RowActionsMenu>` with Edit + Archive entries. Edit opens an `<EntityFormModal>` pre-filled from the row; Archive opens an `<ArchiveConfirmDialog>`. Field config is generic over `kind` via discriminated dispatch.

### List pages (4)

- `src/app/(dashboard)/dashboard/inventory/suppliers/page.tsx`
- `src/app/(dashboard)/dashboard/inventory/locations/page.tsx`
- `src/app/(dashboard)/dashboard/inventory/categories/page.tsx`
- `src/app/(dashboard)/dashboard/inventory/items/page.tsx`

Each gained:
- New `<NoItemsYet>` empty-state primitive (replaces handwritten dashed-border placeholder)
- New actions column (suppliers / locations / categories) or absolutely-positioned menu (items, since cards are wrapped in `<Link>`)
- `<InventoryRowActions>` wired with the correct `kind` + row shape

---

## Architecture decisions

### Soft-delete via `status = "archived"` — no schema change

All four tables already have `status text NOT NULL DEFAULT 'active'`. Archive flips that column. No migration. No data loss. Keeps the row referenceable from historical movements / POs / counts. Reversible via a future "restore" action (Stage 10.E.2 candidate or operator-led data fix).

### Update reuses the create zod schema

Same validation applies on update. The `createSupplierSchema` etc. don't actually require an id — they describe the entity shape. The update action wraps a `safeParse` over the same schema and stamps the id from the `IdActionInput` arg.

### Action signature for update is `(input, prev, formData)`

Two-arg `(prev, formData)` is the React Server Action signature for `useActionState`. Update actions need the entity id as well. Using a positional first arg (`{id}`) keeps the existing `useActionState` ergonomic — consumers wrap with `.bind(null, {id: row.id})` if they want a 2-arg form. Today's wrapper calls them imperatively from a client component (no `useActionState` involved), so the explicit shape is fine.

### Wrapper handles 4 kinds, not 4 separate components

Discriminated `kind` prop is more code than 4 thin wrappers, but:
- One file to maintain → consistent behavior
- Audit-log + revalidate paths visible in one place
- Adding a 5th entity (e.g. "vendor preferences") is a 10-line patch
- The wrapper IS the consumer pattern — Stage 10.E.2 (Operations) will follow the same shape

### Items page actions menu floats absolutely

`<ItemCard>` wraps the entire body in a `<Link>` (clickable card pattern). Putting the kebab inside would break button-in-link nesting (HTML invalid + a11y broken). Solution: wrap in `relative` div + position the menu `absolute top-3 right-3 z-10`. Stops bubble-up to the link click. No ItemCard changes — preserves API stability.

### Form fields per kind

| Kind | Field count | Notable |
|---|---|---|
| supplier | 6 (name, type, country, email, phone, notes) | name/notes span 2 cols |
| location | 3 (name, type, description) | name/description span 2 cols |
| category | 4 (key, name, defaultUnit, isConsumable) | **key disabled on edit** — stable identifier |
| item | 6 (name, sku, type, unit, brand, description) | name/description span 2 cols |

Form spans use the EntityFormModal grid system from 10.D.

---

## Trade-offs + scope discipline

**1. No live render tests.** Same rationale as 10.D — node:test doesn't render React; tests verify static contracts (server-action exports, audit keys, page wiring, primitive imports). End-to-end behavior verifies in production via the cleanup audit re-run.

**2. No restore-from-archive flow.** Archive is one-way in this phase. Restore is a 30-line follow-up if operators surface the need; for now archived rows are filterable from list views (status badge surfaces it).

**3. No bulk archive.** Per-row only. Bulk operations are a Stage 11 candidate when row-selection patterns ship.

**4. Movements page deliberately skipped.** Event-sourced design is correct; surfacing an Edit action would invite the bug pattern of "fix the typo, lose the audit trail". A counter-movement form (already shipped at `/movements/new`) is the canonical correction.

**5. Audit's partial-CRUD list had 2 inventory items not in this phase:** `/dashboard/inventory` (overview) and `/dashboard/inventory/movements`. Overview has no list to edit; movements are out of scope above. Both effectively closed.

**6. Items card-grid layout retained.** Could have switched to a table for consistency with the other 3 pages, but the existing card-grid is the better information-density choice for items (stock status, brand, supplier all shown). Floating the kebab solves the menu-in-link problem without touching the card.

**7. No explicit "edit modal preserves user input on cancel".** Inherited from the EntityFormModal primitive (zero-data-loss-on-validation-error). On modal close + reopen, values reset to the row's persisted state — that's the correct behavior since each modal session is independent.

---

## Phase 10.E.1 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 4 update server actions | yes | ✅ test |
| 4 archive server actions (soft-delete) | yes | ✅ test |
| Permission gating consistent with create actions | yes | ✅ test |
| Audit-log keys for each action | yes | ✅ test |
| Revalidate-path for each action | yes | ✅ test |
| Soft-delete only (no hard DELETE) | yes | ✅ test |
| Reusable client wrapper | yes | ✅ test |
| 4 list pages wired | yes | ✅ test |
| NoItemsYet replaces handwritten empty states | yes | ✅ test |
| Tests | ~20 | ✅ 21 |
| Total tests | 5084 → ~5105 | ✅ 5105 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.E.1 ACCEPTED.**

---

## What unblocks Phase 10.E.2

Phase 10.E.2 (Operations pages, 3 days, ~15 tests) is the next sub-phase. Targets `/dashboard/operations/{tasks, housekeeping, maintenance, preventive, checklists, service-requests, damage-reports}` which all surfaced as partial-CRUD in the audit. Same `<InventoryRowActions>`-style pattern with operations-specific entities + permissions.

Halt-and-report cadence preserved per master plan: each E sub-phase commits + halts before the next begins.

---

## Stage 10 status

**Track A (UX Hygiene) progress:**
- 10.B-CLEANUP — ✅ shipped (`75538db`)
- 10.C — ✅ shipped (`14c31a5`)
- 10.D — ✅ shipped (`4693449`)
- **10.E.1 — ✅ shipped today**
- 10.E.2 (operations) → 10.E.3 (owner-stays/owners/shares) → 10.E.4 (villa-guides) → 10.E.5 (settings/payments) → 10.E.6 (dev-os) → 10.E.7 (delete confirmation rollout) — pending
- 10.F — pending
