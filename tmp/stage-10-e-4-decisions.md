# Stage 10 / Phase 10.E.4 — Villa-guides CRUD — Decisions

**Date**: 2026-05-08
**Hours target**: 2 days (sub-phase 4 of 7) | Tests target: ~10 | Migrations: 0
**Tests delivered**: 16 static
**Test count**: 5140 → 5156 passing (+16)

---

## What 10.E.4 shipped

Closes the audit's operator-flagged partial-CRUD finding for the 3 villa-guide list pages. All three already had `upsert*` actions (which handle Edit when the FormData carries an id) — Edit was conceptually supported but unsurfaced in row UI. Sections also had `archiveGuideSectionAction`; the other two needed it.

| Page | Audit | Before | After |
|---|---|---|---|
| `/dashboard/villa-guides/sections` | flagged | Add only (upsert + archive existed, unwired) | Add + Edit + Archive |
| `/dashboard/villa-guides/emergency-contacts` | flagged | Add only (upsert existed, no archive) | Add + Edit + Archive (NEW) |
| `/dashboard/villa-guides/neighborhood` | flagged | Add only (upsert existed, no archive) | Add + Edit + Archive (NEW) |

Bonus: `archiveWifiCredentialAction` ships in this phase too. The wifi page wasn't wired in this sub-phase (its detail at `/wifi/[id]` already supports edit + has an existing custom flow); the action is available for future use.

---

## What changed in existing code

### Server actions — `src/features/villa-guides/actions.ts` (+3 functions)

- `archiveEmergencyContactAction(prev, formData)` — soft-delete (`status: "archived"`)
- `archiveNeighborhoodPlaceAction(prev, formData)` — same
- `archiveWifiCredentialAction(prev, formData)` — same

All gated on `villa_guide.write` permission. All audit-log with `villa_guide.{contact|place|wifi}.archive`. All revalidate the canonical list path. All return `{ ok: false, error }` on missing row.

### Service-side row shape — `src/features/villa-guides/services.ts` (extended 2 admin lists)

- `listEmergencyContactsAdmin` — added `notesMd` to the returned row shape
- `listNeighborhoodAdmin` — added `descriptionMd`, `address`, `googleMapsUrl`, `imageUrl` to the returned row shape

These extensions are required by the **merge-pattern** (`{...row.values, ...userEdits}` before submit). Without them, editing a contact/place via the modal would null out fields the modal doesn't expose. Test verifies the field presence.

### Client wrapper — `src/components/dashboard/villa-guides/villa-guides-row-actions.tsx` (NEW)

- Drop-in `<VillaGuidesRowActions kind row canWrite />` — handles 3 entity kinds (`section | contact | place`)
- Composes 10.D primitives: `<RowActionsMenu>` + `<EntityFormModal>` + `<ArchiveConfirmDialog>`
- Same merge pattern as previous E sub-phases: `{...row.values, ...userEdits}` then `fd.append("id", row.id)` before invoking the existing `upsert*` server actions
- `sectionKey` field is disabled on edit (stable identifier — like `key` in inventory categories)

### List pages (3)

- `/dashboard/villa-guides/sections` — table + actions column + `<NoItemsYet>` empty state
- `/dashboard/villa-guides/emergency-contacts` — same shape
- `/dashboard/villa-guides/neighborhood` — same shape

---

## Architecture decisions

### Reuse upsert for Edit (no new update action)

The existing `upsertGuideSectionAction` / `upsertEmergencyContactAction` / `upsertNeighborhoodPlaceAction` already branch on `id` presence — present means update, absent means insert. The wrapper sets `id` in FormData, and the upsert handles the rest. No new update actions, no schema duplication. Audit-log key adapts: "create" vs "update" based on `parsed.data.id`.

### Service-side row extensions for merge-pattern correctness

When the edit modal exposes only 5 fields but the entity has 12, the wrapper merges the row's full payload + the user's edits before submit. If the row payload is missing a field, the merge produces `undefined`, which the upsert action's `parseForm` turns into `null`, which then nulls out the DB column. **Bug prevented by ensuring listAdmin returns every editable field.** Test verifies this with negative regex on the service code.

### Wifi action ships, but page not wired in this sub-phase

`archiveWifiCredentialAction` is in `actions.ts` but the wifi list page (`/dashboard/villa-guides/wifi`) is intentionally not touched. Reason: the wifi detail page (`/wifi/[id]`) has an existing custom edit/migrate flow with crypto context (passwordCiphertext, key versions) that doesn't fit the simple modal pattern. A future sub-phase can wire the archive button into the existing detail page; the action is available now.

### sectionKey is locked on edit

Sections have a `sectionKey` (lowercase snake_case identifier like `welcome`, `wifi_instructions`) that's used to resolve villa-scoped vs. project-scoped sections. Changing the key post-create would orphan the row's resolution; treated as immutable like inventory category `key` in 10.E.1.

---

## Trade-offs + scope discipline

**1. WiFi page not wired.** Custom crypto flow at `/wifi/[id]` is the right surface for wifi edits; per-row archive button on the list page is a future enhancement. Action is shipped; UI is one Stage 11 sub-phase away.

**2. No bulk archive.** Same as 10.E.1-10.E.3 — Stage 11 candidate.

**3. No restore from archived sections / contacts / places.** One-way archive for this phase.

**4. Section's sectionKey immutable on edit.** Post-create key changes would orphan resolution; consistent with inventory category `key` lock.

**5. Place + contact text fields preserved via service-shape extension.** Added 5 fields total to admin list returns (notesMd / descriptionMd / address / googleMapsUrl / imageUrl). Negligible perf cost (no joins added; just selecting more columns on the same row).

**6. Wrapper handles 3 kinds via discriminated dispatch.** Same pattern as previous E sub-phases. Adding wifi as a fourth kind is a 30-line patch when the page-side flow is decided.

---

## Phase 10.E.4 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 3 new archive actions | yes | ✅ test |
| Existing 5 actions intact (regression guard) | yes | ✅ test |
| Soft-delete (status -> "archived") | yes | ✅ test |
| Permission gating consistent | yes | ✅ test |
| Audit-log keys for each | yes | ✅ test |
| Revalidate canonical list paths | yes | ✅ test |
| Service-side row shape preserves merge fields | yes | ✅ test |
| Reusable client wrapper handling 3 kinds | yes | ✅ test |
| sectionKey disabled on edit (immutable) | yes | ✅ test |
| 3 list pages wired with menu + NoItemsYet | yes | ✅ test |
| Tests | ~10 | ✅ 16 |
| Total tests | 5140 → ~5150 | ✅ 5156 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.E.4 ACCEPTED.**

---

## E sub-phase progress

- 10.E.1 — Inventory pages — ✅ shipped (`0c46aa2`)
- 10.E.2 — Operations pages — ✅ shipped (`674034b`)
- 10.E.3 — Owner-stays + Owners + Shares — ✅ shipped (`aeb3537`)
- **10.E.4 — Villa-guides edits — ✅ shipped today**
- 10.E.5 — Settings + Payments + others (2 days, ~10 tests) — pending
- 10.E.6 — Dev-OS rollout (3 days, ~20 tests) — pending
- 10.E.7 — Delete confirmation rollout (~5 tests) — pending
