# Stage 10 / Phase 10.E.3 — Owner-stays + Owners + Shares CRUD — Decisions

**Date**: 2026-05-08
**Hours target**: 3 days (sub-phase 3 of 7) | Tests target: ~15 | Migrations: 0
**Tests delivered**: 16 static
**Test count**: 5122 → 5138 passing (+16)

---

## What 10.E.3 shipped

Closes the audit's HIGH-severity partial-CRUD finding for the 4 owner-side list pages. Owners already had a full CRUD action set (createOwner / updateOwner / archiveOwner / unarchiveOwner shipped earlier); the audit flagged it because the row UI didn't surface Edit/Archive. This sub-phase wires the owner row UI + adds the missing actions for the other three entities.

| Page | Audit | Before | After |
|---|---|---|---|
| `/dashboard/owners` | HIGH | Add only (actions existed) | Add + Edit + Archive wired via menu |
| `/dashboard/shares` | HIGH | Add + archive only | Add + Edit (constrained) + End share |
| `/dashboard/owner-stays/policies` | HIGH | Add + archive only | Add + Edit + Archive (NEW update action) |
| `/dashboard/owner-stays/equivalence-groups` | HIGH | Add only | Add + Edit + Archive (NEW update + archive actions) |

---

## What changed in existing code

### Server actions

**`src/features/shares/actions.ts` (+1 function):**
- `updateShareAction(prev, formData)` — **constrained edit**. Validates the full createShareSchema (preserves the model ↔ villa/project invariants) but mutates only sharePercent / startsOn / endsOn / status. ownerId / villaId / projectId / model stay immutable post-create — they're ledger fields that drive distribution math. Audit-logs share.update with before+after diff.

**`src/features/owner-stays/actions.ts` (+3 functions):**
- `updateOwnerStayPolicyAction(prev, formData)` — full-policy edit using createOwnerStayPolicySchema + parsePolicyForm. Same gate as createOwnerStayPolicyAction (`owner_stay.approve`).
- `updateEquivalenceGroupAction(prev, formData)` — name / description / projectId edit; gates on `relocation.manage`.
- `archiveEquivalenceGroupAction(prev, formData)` — flips status to "archived"; gates on `relocation.manage`.

All gated on existing permissions. All audit-log + revalidate the canonical list path. All return `{ ok: false }` on missing row.

### Client wrapper — `src/components/dashboard/owners/owners-row-actions.tsx` (NEW)

- Drop-in `<OwnersRowActions kind row canWrite />` — handles 4 entity kinds (`owner | share | policy | equivalence_group`)
- Composes 10.D primitives: `<RowActionsMenu>` + `<EntityFormModal>` + `<ArchiveConfirmDialog>`
- Each menu has 2-3 actions: optional View detail (link), Edit (modal), Archive (confirm)
- Archive label adapts per entity: "End share" for shares, "Archive" elsewhere — matches the existing `archiveShareAction` semantics (status → "ended", not "archived")
- Merge pattern: `{...row.values, ...userEdits}` so the existing edit schemas validate cleanly while modal stays small
- Appends `id` to FormData — all 4 actions take id-in-formdata (consistent with the existing owner/share patterns; differs from inventory's `(input, prev, formData)` arg shape)

### List pages (4)

- `/dashboard/owners` — table + actions column + `<NoItemsYet>` empty state
- `/dashboard/shares` — table + actions column + `<NoItemsYet>` empty state
- `/dashboard/owner-stays/policies` — custom `<table>` (not the shared `<Table>`) + actions column + `<NoItemsYet>` empty state
- `/dashboard/owner-stays/equivalence-groups` — `<Section>` per group; the kebab sits in the Section's `action` slot (group-level, since each group already has a per-member member-add form)

---

## Architecture decisions

### Constrained share edit

Shares are historically-significant ledger rows. Editing ownerId / villaId / projectId / model post-create would corrupt distribution math (paid-out commitments reference the share's owner / villa). Solution: edit modal exposes only the operationally-correctable fields (sharePercent, startsOn, endsOn, status); the full payload round-trips for schema validation but the `.set()` block deliberately omits the immutable fields. Tests verify the omission with negative regex assertions (no `ownerId:` / `villaId:` / etc. in `.set` block).

The modal's helper text on the sharePercent field documents this: "Owner / villa / pool identifiers stay immutable post-create."

### Equivalence group archive uses status="archived" (not "ended")

Shares end (transition to "ended" terminal state via existing archiveShareAction); equivalence groups archive. Different terminal semantics, both supported by the existing `status text` columns. No schema change.

### Equivalence group menu sits at Section level, not row level

Each equivalence group renders as its own `<Section>` (group title + per-member table). Rather than wire a per-row menu on group members (which would imply Edit/Archive for individual member rows — different semantics requiring per-member endpoints), the group-level kebab handles Edit (group name/description) and Archive (group itself). Per-member operations remain via the existing `<AddEquivalenceMemberForm>`.

### Owners reuses existing actions (no new server-side work)

Stage 9 / 6.x already shipped the full owner CRUD chain (`createOwnerAction` / `updateOwnerAction` / `archiveOwnerAction` / `unarchiveOwnerAction`). 10.E.3's only owner-side change is wiring the row UI to the menu primitive. Tests include a regression guard verifying all 4 actions still exist.

---

## Trade-offs + scope discipline

**1. No bulk operations.** Same as 10.E.1 + 10.E.2 — Stage 11 candidate.

**2. No restore / unarchive UI exposure beyond owners.** Owners had `unarchiveOwnerAction` already; not wired into the row menu (would require listing archived owners, which the page doesn't do today). One-way archive for shares + policies + equivalence-groups in this phase.

**3. Share immutable-field constraint enforced server-side, advertised client-side.** The client could send mutated ownerId/villaId/projectId in FormData; the server `.set()` block deliberately ignores them. Belt-and-braces: client form doesn't expose those fields as editable, server treats them as if they weren't sent.

**4. Owner-stay request not in this sub-phase.** Owner stay requests have a state-machine lifecycle (createOwnerStayRequestAction → cancelOwnerStayRequest / approveOwnerStayRequest / rejectOwnerStayRequest). Edit doesn't fit that lifecycle — corrections happen via cancel + recreate. Audit didn't flag the requests page.

**5. Equivalence group member operations not changed.** Per-member quality-rank edits + member archive are a separate feature; out of scope. Only group-level Edit/Archive in this sub-phase.

**6. Same merge pattern as 10.E.2.** Rather than maintain separate update schemas, reuse the create schema and merge full row + edits before submit. Schema-valid + small modal.

---

## Phase 10.E.3 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 4 new server actions | yes | ✅ test |
| Constrained share edit (ledger-immutable) | yes | ✅ test |
| Permission gating consistent | yes | ✅ test |
| Audit-log keys for each action | yes | ✅ test |
| Existing owner actions intact (regression guard) | yes | ✅ test |
| Reusable client wrapper | yes | ✅ test |
| 4 list pages wired with menu + NoItemsYet | yes | ✅ test |
| Section-level menu for equivalence groups | yes | ✅ test |
| Tests | ~15 | ✅ 16 |
| Total tests | 5122 → ~5137 | ✅ 5138 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.E.3 ACCEPTED.**

---

## E sub-phase progress

- 10.E.1 — Inventory pages — ✅ shipped (`0c46aa2`)
- 10.E.2 — Operations pages — ✅ shipped (`674034b`)
- **10.E.3 — Owner-stays + Owners + Shares — ✅ shipped today**
- 10.E.4 — Villa-guides edits (2 days, ~10 tests) — pending
- 10.E.5 — Settings + Payments + others (2 days, ~10 tests) — pending
- 10.E.6 — Dev-OS rollout (3 days, ~20 tests) — pending
- 10.E.7 — Delete confirmation rollout (~5 tests) — pending
