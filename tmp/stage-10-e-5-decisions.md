# Stage 10 / Phase 10.E.5 — Settings + Payments + others CRUD — Decisions

**Date**: 2026-05-08
**Hours target**: 2 days (sub-phase 5 of 7) | Tests target: ~10 | Migrations: 0
**Tests delivered**: 14 static
**Test count**: 5157 → 5171 passing (+14)

---

## What 10.E.5 shipped

Closes the audit's HIGH-severity partial-CRUD finding for the 5 settings/integrations/security/service-fulfilment pages. Most had partial action sets; this sub-phase added the missing 2 server actions and wired all 5 list pages via the new shared `<SettingsRowActions>` wrapper.

| Page | Audit | Before | After |
|---|---|---|---|
| `/dashboard/settings/responsibility-scopes` | HIGH | full CRUD existed, only Archive button surfaced | Edit (modal) + Archive |
| `/dashboard/security/cameras` | HIGH | Edit existed, no archive | Edit + Archive (NEW archive action) |
| `/dashboard/payments/providers` | HIGH | disconnect existed (= archive), no edit | Disconnect (no Edit — credentials require crypto) |
| `/dashboard/service-fulfilment/vendors` | HIGH | full CRUD existed, no row UI | Edit + Archive |
| `/dashboard/integrations/calendar-feeds` | HIGH | archive existed, no edit | Edit (NEW edit action) + Archive |

---

## What changed in existing code

### Server actions (+2 functions)

**`src/features/security/actions.ts`:**
- `archiveSecurityCameraDeviceAction(prev, formData)` — soft-delete (`status: "archived"`); gates on `security.manage`; audit-logs `security.camera.archive`.

**`src/features/integrations/calendar-sync/actions.ts`:**
- `editCalendarFeedAction(prev, formData)` — full re-validation against `createCalendarFeedSchema`; mutates feedName / feedUrl / feedType / syncIntervalMinutes / villaId / projectId / bookingChannelId. Status transitions remain on the existing pause/resume/archive actions.

### Client wrapper — `src/components/dashboard/settings/settings-row-actions.tsx` (NEW)

- Drop-in `<SettingsRowActions kind row canWrite />` — handles 5 entity kinds (`scope | camera | payment_connection | service_vendor | calendar_feed`)
- Composes 10.D primitives: `<RowActionsMenu>` + `<EntityFormModal>` + `<ArchiveConfirmDialog>`
- Same merge pattern as previous E sub-phases: `{...row.values, ...userEdits}` then `fd.append("id", row.id)` before invoking the existing actions
- **Two action signatures coexist** — most actions take `(prev, formData)`; `disconnectPaymentConnectionAction` takes `{ connectionId, reason? }`. Wrapper handles both in one `onArchive` body.
- **Archive label adapts** — "Disconnect" for payment_connection (matches the action's intent + UI vocabulary), "Archive" elsewhere.
- **payment_connection has no Edit** — credentials live in `config_private_encrypted` and require crypto context; updating them is a disconnect + reconnect flow, not an inline modal. `fieldsFor` returns `[]` for this kind, which suppresses the Edit menu entry; only Archive remains.

### List pages (5)

- `/dashboard/settings/responsibility-scopes` — replaced `ScopeArchiveButton` with `<SettingsRowActions kind="scope">`; added `<NoItemsYet>` empty state
- `/dashboard/security/cameras` — added actions column + `<NoItemsYet>` empty state
- `/dashboard/payments/providers` — added actions column on the connections table; `<NoItemsYet>` empty state
- `/dashboard/service-fulfilment/vendors` — added actions column + `<NoItemsYet>` empty state
- `/dashboard/integrations/calendar-feeds` — added trailing actions menu on each list item; `<NoItemsYet>` empty state

---

## Architecture decisions

### Payment connections — no Edit by design

Payment-processor credentials are stored encrypted (`config_private_encrypted`); decrypting + re-encrypting on the client is unsafe. The operator's flow is: **disconnect** the bad connection (status -> "archived" via the existing action) + **add** a new one. Wrapper enforces this by returning empty `fields[]` for `kind="payment_connection"`, which the wrapper interprets as "no Edit menu entry, Archive only".

### Calendar feed edit re-validates with the create schema

Same pattern as previous E sub-phases. `createCalendarFeedSchema` already enforces all the constraints (URL validity, sync interval bounds, feed type enum); the edit reuses it instead of duplicating. The merge pattern then carries the row's full payload + the user's edits, so the modal can expose 4-5 most-edited fields (feedName / feedUrl / feedType / syncIntervalMinutes) while villaId / projectId / bookingChannelId pass through unchanged.

### Two action-call signatures handled in one wrapper

Most server actions in this set take `(prev: ActionResult, formData: FormData)`. `disconnectPaymentConnectionAction` is the exception — it takes a typed object `{ connectionId, reason? }` and returns a different ActionResult shape (`{ ok: true } | { ok: false; error }` without `redirectTo`). Wrapper's `onArchive` switches on `kind`: builds FormData + appends id for the FormData-shaped actions, calls the typed action with `{ connectionId: row.id }` for payments. Tests verify both paths.

### Service vendor field config matches the schema (caught at type-check)

Initial wrapper draft used `name`/`phone`/`email`/`whatsapp` field names that didn't exist on `serviceVendors` table — the actual schema is `displayName`/`contactPhone`/`contactEmail`/`preferredChannel`/`internalNotes`. Type-check would have caught this at submit time but the wrapper itself is `Record<string, unknown>`-typed. Fixed during wiring after inspecting the actual `createServiceVendorSchema`. **Lesson:** when a wrapper's modal field config posts to an existing zod schema, double-check the schema field names — generic `Record<string, unknown>` typing won't error at compile time.

---

## Trade-offs + scope discipline

**1. utilities/accounts deferred.** Schema is large (15+ fields including bigint balance thresholds, billing cycle days, multiple currency fields). 2-day budget didn't fit. Action surface is `createUtilityAccountAction` / `recordUtilityReadingAction` / `createUtilityPaymentReminderAction` / `markUtilityPaymentPaidAction` — readings and payments are event-sourced, accounts themselves need update + archive. **Stage 10.E.6 candidate or follow-up.**

**2. integrations/calendar-events not wired.** Events page is a read-only audit log of materialised events; per-row Edit/Delete doesn't apply (events are derived from feeds). The wrapper supports it conceptually as a `kind` extension if needed.

**3. pricing/rule-sets, projects, documents deferred.** Each has its own schema complexity + existing detail-page flows. Out of 10.E.5's 2-day budget; targeted as separate E sub-phases or 10.E.6.

**4. payment_connection edit deferred to disconnect + reconnect.** No way around the crypto constraint without server-side re-encrypt flow, which is a Stage 11+ feature.

**5. ScopeArchiveButton retired.** The custom one-button affordance is replaced by the standard menu. Test verifies the import is gone.

**6. service_vendor edit field set is curated.** The full schema has 12 fields; modal exposes 7 most-edited (displayName / legalName / contactName / contactPhone / contactEmail / serviceArea / internalNotes). Vendor code, type, preferred channel, default currency, languages stay on the dedicated detail page (`/vendors/[id]`).

---

## Phase 10.E.5 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 2 new server actions (camera archive + calendar edit) | yes | ✅ test |
| Existing 6 actions intact (regression guard) | yes | ✅ test |
| Soft-delete (status -> "archived") | yes | ✅ test |
| Permission gating consistent | yes | ✅ test |
| Audit-log keys + revalidate paths | yes | ✅ test |
| Reusable wrapper handling 5 kinds | yes | ✅ test |
| Two action-call signatures (FormData + typed object) | yes | ✅ test |
| payment_connection has Disconnect, no Edit | yes | ✅ test |
| 5 list pages wired with menu + NoItemsYet | yes | ✅ test |
| ScopeArchiveButton retired | yes | ✅ test |
| Tests | ~10 | ✅ 14 |
| Total tests | 5157 → ~5167 | ✅ 5171 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.E.5 ACCEPTED.**

---

## E sub-phase progress

- 10.E.1 — Inventory pages — ✅ shipped (`0c46aa2`)
- 10.E.2 — Operations pages — ✅ shipped (`674034b`)
- 10.E.3 — Owner-stays + Owners + Shares — ✅ shipped (`aeb3537`)
- 10.E.4 — Villa-guides edits — ✅ shipped (`6e16613`)
- **10.E.5 — Settings + Payments + others — ✅ shipped today**
- 10.E.6 — Dev-OS rollout (3 days, ~20 tests) — pending
- 10.E.7 — Delete confirmation rollout (~5 tests) — pending

Carry-over to consider for 10.E.6 or follow-up:
- utilities/accounts (Mgmt OS, deferred from this phase due to schema size)
- pricing/rule-sets (Mgmt OS)
- projects, documents (Mgmt OS)
- guest-journey/rules (Mgmt OS, complex rule engine)
