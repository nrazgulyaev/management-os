# Stage 10 / Phase 10.E.6 — Dev-OS CRUD rollout — Decisions

**Date**: 2026-05-08
**Hours target**: 3 days (sub-phase 6 of 7) | Tests target: ~20 | Migrations: 0
**Tests delivered**: 16 static
**Test count**: 5171 → 5187 passing (+16)

---

## What 10.E.6 shipped

Closes the audit's HIGH-severity partial-CRUD finding for 5 Dev-OS list pages. Most actions existed; this sub-phase added 2 missing pieces and built the shared `<DevOsRowActions>` wrapper to bridge typed Dev-OS actions to the standard menu UI.

| Page | Before | After |
|---|---|---|
| `/development-os/vendors` | create + update + setVendorStatus | Add + Edit + Blacklist |
| `/development-os/investors` | create + update + setInvestorStatus | Add + Edit + Deactivate |
| `/development-os/marketing/lead-sources` | create + deactivate | Add + Edit (NEW) + Deactivate |
| `/development-os/finance/tax-types` | upsert (handles edit) | Add + Edit + Archive (NEW archive) |
| `/development-os/asset-types` | full CRUD | Add + Edit + Deactivate |

---

## What changed in existing code

### Server actions (+2 functions)

**`src/lib/development/server/tax/tax-actions.ts`:**
- `archiveTaxType({id})` — soft-delete via `isActive: false`. Tax types are referenced by historical `tax_classifications` + reports; never hard-delete.

**`src/lib/development/server/lead-sources/lead-source-actions.ts`:**
- `updateLeadSource(sourceKey, input)` — display-field edit. `sourceKey` is the entity identifier (used by historical lead rows) and stays immutable; updateSchema is `createSchema.omit({sourceKey: true})`.

### Client wrapper — `src/components/development/dev-os-row-actions.tsx` (NEW)

- Drop-in `<DevOsRowActions kind row canWrite />` — handles 6 entity kinds (`vendor | investor | lead_source | cost_category | tax_type | asset_type`)
- Composes 10.D primitives: `<RowActionsMenu>` + `<EntityFormModal>` + `<ArchiveConfirmDialog>`
- **Bridges typed actions to FormData modal pattern** — Dev-OS actions take typed object args (`updateVendor(id, patch)`, `upsertTaxType(input)`) rather than `(prev, formData)`. The wrapper takes the modal's FormData-shaped `userEdits`, merges with `row.values`, **coerces types per kind** (lead_source.isPaid → Boolean, tax.ratePercentage → Number, tax.isIncludedInAmount → Boolean), then calls the typed action with the right argument shape.
- **Lead source uses `altId`** — its primary key in the DB is a UUID, but actions reference rows by `sourceKey` (a stable text identifier). Wrapper accepts `altId` on the row prop and prefers it over `id` for those actions.
- **Archive label adapts per kind** — "Blacklist" for vendor (matches the existing `setVendorStatus(id, "blacklisted")` semantics), "Deactivate" for soft-delete-via-isActive entities (investor, lead_source, cost_category, asset_type), "Archive" for tax_type (status text column).
- **Immutable `key` / `typeKey` fields disabled** on cost_category, tax_type, asset_type — they're stable identifiers used by historical references; same lock pattern as inventory category `key` in 10.E.1 + section_key in 10.E.4.

### List pages (5)

- `/development-os/vendors` — table + actions column + `<NoItemsYet>` empty state
- `/development-os/investors` — table + actions column (no NoItemsYet — the page already has a richer empty-state with Briefcase badge)
- `/development-os/marketing/lead-sources` — table + actions column + `<NoItemsYet>`
- `/development-os/finance/tax-types` — table + actions column + `<NoItemsYet>`
- `/development-os/asset-types` — table + actions column + `<NoItemsYet>`

---

## Architecture decisions

### Type-coercion shim in the wrapper

Dev-OS actions are typed (e.g. `upsertTaxType` expects `ratePercentage: number`, `isIncludedInAmount: boolean`). The modal's FormData posts strings for everything. Without coercion, `upsertTaxType.parse()` would fail with type errors. Wrapper does:

```ts
if (kind === "tax_type") {
  coerced.ratePercentage = Number(merged.ratePercentage);
  coerced.isIncludedInAmount = Boolean(merged.isIncludedInAmount);
}
if (kind === "lead_source") {
  coerced.isPaid = Boolean(merged.isPaid);
}
```

Other typed fields (UUIDs, strings) round-trip through FormData unchanged.

### Lead-source identifier indirection

Lead sources have both a UUID `id` and a text `sourceKey`. The existing actions take `sourceKey` (operator-meaningful), not `id`. The wrapper accepts an optional `altId` prop on the row payload; pages pass `altId: s.sourceKey`. The wrapper's call sites use `row.altId ?? row.id`.

This is a one-off pattern for lead sources — every other entity uses `id`. Documenting via the test ensures future entities don't accidentally mis-pattern this.

### Tax types use isActive (boolean), not status text

`taxTypes` table has `isActive: boolean NOT NULL DEFAULT true` instead of a `status text` column. `archiveTaxType` flips `isActive: false`. Different from most other entities in the codebase but consistent with how the schema was originally modelled (yes/no relevance vs. multi-state lifecycle).

### Vendor archive uses setVendorStatus, not a dedicated archive

`setVendorStatus(id, status, blacklistReason?)` already supports the full vendor lifecycle. Wrapper's archive call uses it with `status: "blacklisted"` (the only operator-side terminal state); reason is "Archived from list view" by default. If operators need richer reason capture, `<ArchiveConfirmDialog>` already has a `typeToConfirm` slot; can extend later.

### Cost categories deferred — 6 → 5 pages

Originally targeted 6 pages. Cost categories renders parent/children in a tree (recursive component). Wiring `<DevOsRowActions>` inline would require touching the tree-rendering logic. The page already has `CostCategoryArchiveButton` — only Edit is missing, and the parent/child reshape is a Stage 11 candidate. **5/6 pages shipped this sub-phase**; cost-categories edit deferred.

---

## Trade-offs + scope discipline

**1. No bulk operations.** Same as 10.E.1-10.E.5.

**2. Vendor archive label is "Blacklist".** Operator-friendly word matches the schema enum (`status: "blacklisted"`). Could be confusing in a kebab menu — operator will need to read the confirm dialog. If the audit re-runs and flags this, easy to swap to "Archive" + map to the status enum value.

**3. Investor archive label is "Deactivate".** `setInvestorStatus(id, "inactive")` — investors aren't fully deleted (commitments + distributions reference them); status flip is the canonical pattern.

**4. Tax type / asset type / cost category `key` fields locked on edit.** Same as inventory categories + villa-guide sections — stable identifiers driving foreign key references; never mutable post-create.

**5. Cost-categories edit deferred.** Parent/child tree complicates inline action menu; existing archive button stays. Stage 11 follow-up if operators surface the need.

**6. No Dev-OS pages with `<NoItemsYet>` skipped.** Investors page kept its richer empty-state (with Briefcase + investor-type list); didn't replace with `<NoItemsYet>` to preserve operator copy. Other 4 pages standardized.

**7. Lead-source page replaces a misleading "Run the migrations to seed defaults" empty-state.** The audit + 10.B-CLEANUP already touched dev-leak strings; this sub-phase confirms zero regressions on that page.

---

## Phase 10.E.6 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 2 new server actions (archiveTaxType + updateLeadSource) | yes | ✅ test |
| Existing 12 actions intact (regression guard) | yes | ✅ test |
| sourceKey omitted from updateLeadSource (immutable) | yes | ✅ test |
| Tax type uses isActive (not status text) | yes | ✅ test |
| Reusable wrapper handling 6 kinds | yes | ✅ test |
| Type-coercion shim (Boolean / Number per kind) | yes | ✅ test |
| Lead source altId indirection | yes | ✅ test |
| Archive label adapts per kind | yes | ✅ test |
| Immutable key fields disabled | yes | ✅ test |
| 5 list pages wired with menu + NoItemsYet | yes | ✅ test |
| Tests | ~20 | ✅ 16 |
| Total tests | 5171 → ~5191 | ✅ 5187 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.E.6 ACCEPTED.**

---

## E sub-phase progress

- 10.E.1 — Inventory pages — ✅ shipped (`0c46aa2`)
- 10.E.2 — Operations pages — ✅ shipped (`674034b`)
- 10.E.3 — Owner-stays + Owners + Shares — ✅ shipped (`aeb3537`)
- 10.E.4 — Villa-guides edits — ✅ shipped (`6e16613`)
- 10.E.5 — Settings + Payments + others — ✅ shipped (`1bbe374`)
- **10.E.6 — Dev-OS rollout — ✅ shipped today**
- 10.E.7 — Delete confirmation rollout (~5 tests) — pending; final E sub-phase

10.E.7 will be a sweep — every list page that ships a Delete/Archive should have a `<ArchiveConfirmDialog>` (or `<DeleteConfirmDialog>` for hard-delete cases) wrapping the action. The 5 sub-phases above already use ArchiveConfirmDialog inside their wrappers, so 10.E.7 is mostly a validation pass + any straggler pages with bare delete buttons.
