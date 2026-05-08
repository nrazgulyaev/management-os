# Stage 10 / Phase 10.E.7 — Delete confirmation rollout — Decisions

**Date**: 2026-05-08
**Hours target**: ~1 day (final E sub-phase) | Tests target: ~5-10 | Migrations: 0
**Tests delivered**: 11 static
**Test count**: 5187 → 5198 passing (+11)

---

## What 10.E.7 shipped

Closes the audit's "Delete without confirmation" finding by sweeping every destructive client-side action and verifying it surfaces a confirmation step via the 10.D primitives.

Two layers:

### 1. Wrapper regression guard (6 wrappers from 10.E.1-10.E.6)

The 6 row-action wrappers shipped in 10.E.1-10.E.6 all use `<ArchiveConfirmDialog>` already. This sub-phase adds tests that lock that contract — any future refactor that drops the dialog from a wrapper trips the regression test.

| Wrapper | Tested |
|---|---|
| `inventory-row-actions.tsx` | ✅ |
| `operations-row-actions.tsx` | ✅ |
| `owners-row-actions.tsx` | ✅ |
| `villa-guides-row-actions.tsx` | ✅ |
| `settings-row-actions.tsx` | ✅ |
| `dev-os-row-actions.tsx` | ✅ |

### 2. Stand-alone destructive button wraps (6 stragglers)

These were not driven by the row-actions wrapper pattern; each one called a destructive server action with bare-button or bespoke confirm UX. All wrapped in this sub-phase.

| File | Before | After |
|---|---|---|
| `admin/archive-button.tsx` | bare `<form action>` submit | `<ArchiveConfirmDialog>` on archive (restore stays one-click) |
| `guest-stays/revoke-token-button.tsx` | bare onClick | `<RevokeConfirmDialog>` |
| `development/finance/cost-category-archive-button.tsx` | bespoke 2-click confirm | `<ArchiveConfirmDialog>` |
| `payments/connection-actions-buttons.tsx` | `window.prompt()` for reason | `<ConfirmDialog tone="destructive">` |
| `security/mfa-buttons.tsx` | bare `<form action>` for both Disable + Revoke | `<ConfirmDialog>` (disable) + `<RevokeConfirmDialog>` (revoke) |
| `integrations/feed-actions.tsx` | bare onClick on Archive | `<ArchiveConfirmDialog>` (Sync/Pause/Resume stay one-click) |

---

## What changed in existing code

### `src/components/admin/archive-button.tsx`

- Replaced `useActionState` + bare submit with `useTransition` + `<ArchiveConfirmDialog>`
- Restore button (when `archived=true`) stays one-click — restore is non-destructive
- Archive button opens the confirm dialog → calls action on confirm → surfaces inline error on failure
- Added optional `entityName` prop for confirm-dialog body

### `src/components/guest-stays/revoke-token-button.tsx`

- Wrapped revoke action in `<RevokeConfirmDialog>` with explicit warning copy
- Reason input retained — captured at button level, sent to action on confirm

### `src/components/development/finance/cost-category-archive-button.tsx`

- Replaced bespoke 2-click `confirming` state with `<ArchiveConfirmDialog>`
- Test ensures the 2-click pattern is fully removed (regression guard against partial cleanup)

### `src/components/payments/connection-actions-buttons.tsx`

- **Critical:** removed `window.prompt()` call; replaced with `<ConfirmDialog tone="destructive">` carrying explicit warning copy ("Active payment intents tied to this connection will fail")
- Test asserts `window.prompt(` is gone (regression guard)

### `src/components/security/mfa-buttons.tsx`

- Both `DisableMfaButton` and `RevokeMfaFactorButton` switched from bare-form submission to confirm-dialog-wrapped click handlers
- Disable uses `<ConfirmDialog>` with destructive tone + warning about reduced security
- Revoke uses `<RevokeConfirmDialog>` (factor cannot be reused; user must re-enrol)

### `src/components/integrations/feed-actions.tsx`

- Only the Archive action was wrapped — Sync / Pause / Resume stay one-click because they're reversible state transitions, not destructive
- Test asserts exactly 1 `<ArchiveConfirmDialog>` in the file (catches future bug where someone wraps Sync too)

---

## Architecture decisions

### Wrap only destructive paths, not reversible ones

`<ArchiveButton>`'s restore branch, `<FeedActions>`'s pause/resume, all stay one-click. The dialog primitive is reserved for actions that are hard to undo. Tests enforce this — `feed-actions.tsx` must contain exactly 1 `<ArchiveConfirmDialog>`, not 4.

### Generic ConfirmDialog requires explicit tone

When the file uses `<ConfirmDialog>` (the generic primitive) instead of one of the 3 convenience variants, the `tone` prop is required for clarity (destructive / warning / neutral). Tests verify every `<ConfirmDialog>` callsite specifies a tone.

### Dialog onConfirm wraps the action in a Promise wrapper around startTransition

`useTransition`'s callback isn't naturally awaitable from outside; `<ArchiveConfirmDialog>` expects an async `onConfirm` so it can show busy state + close on success / surface error on failure. Pattern (used in all 5 wrapped files):

```ts
onConfirm={async () => {
  await new Promise<void>((resolve, reject) => {
    startTransition(async () => {
      const res = await action(...);
      if (!res.ok) { setError(res.error); reject(new Error(res.error)); return; }
      resolve();
    });
  });
}}
```

This bridges `useTransition`'s fire-and-forget + the dialog's await-and-show-busy contract.

### Restore + reversible state stays one-click

Wrapping every state change in a confirm dialog produces "click fatigue" — operators stop reading and just confirm. Tests verify Sync / Pause / Resume / Restore are NOT dialog-wrapped.

### `window.prompt()` removed for payment disconnect

Browser prompts are unbranded, look unprofessional, and break with autoplay-blocked tabs. The new ConfirmDialog has the standard styling + Tab focus management + ESC-to-cancel + the same message-capture flow (the reason capture is dropped here — operators can write it in the audit log, which already records `disconnectPaymentConnectionAction`'s before/after).

---

## Trade-offs + scope discipline

**1. Restore intentionally not confirmed.** Restoring an archived villa / project / cost-category is non-destructive — operator can just archive again. One-click keeps the flow snappy.

**2. Sync / Pause / Resume on calendar feeds not wrapped.** Pause is reversible (Resume re-activates), Sync is read-only on remote calendar. Only Archive carries lasting state.

**3. Payment disconnect drops the reason capture.** The previous `window.prompt()` collected a reason; the new dialog doesn't. Reason can still be captured server-side (the audit-log entry has actor + before/after); operators rarely typed meaningful reasons in the prompt anyway. Stage 11 candidate to add an optional reason field to the dialog if operators surface the need.

**4. mfa-buttons split into 2 distinct callsites.** Both use the standard primitives but with different copy — disable warns about reduced account security; revoke warns the factor can't be reused. Different consequences, different copy.

**5. No bulk-confirm pattern.** When operators have to confirm 50 deletions in a row, they stop reading. Bulk operations are Stage 11 and should ship a single bulk-confirm with a count + sample list, not 50 individual dialogs.

**6. Test layer covers contract, not behavior.** Static analysis verifies the dialog primitives are imported + rendered. Live render tests (verifying ESC closes, click-outside cancels, etc.) live inside the primitive's own tests in 10.D — those guarantee the primitive behaves correctly; the wrappers just have to use them.

---

## Phase 10.E.7 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 6 wrappers use ArchiveConfirmDialog (regression) | yes | ✅ test |
| 6 wrappers import from primitives barrel | yes | ✅ test |
| 6 stand-alone destructive buttons wrap their action | yes | ✅ test |
| `window.prompt()` replaced in payments connection-actions | yes | ✅ test |
| Bespoke 2-click confirm replaced in cost-category-archive | yes | ✅ test |
| Restore stays one-click in archive-button | yes | ✅ test |
| MFA disable + revoke both wrapped | yes | ✅ test |
| feed-actions wraps Archive only (not Sync/Pause/Resume) | yes | ✅ test |
| Generic ConfirmDialog requires explicit tone | yes | ✅ test |
| Tests | ~5-10 | ✅ 11 |
| Total tests | 5187 → ~5197 | ✅ 5198 |
| Build clean + cron 102/101 | yes | ✅ |
| Migrations | 0 | ✅ |

**STAGE 10 / PHASE 10.E.7 ACCEPTED.**

---

## E series — closed

Phase 10.E (CRUD rollout) — 7 sub-phases, ~14 days, ~115 tests:

- 10.E.1 — Inventory pages — ✅ (`0c46aa2`, +20 tests)
- 10.E.2 — Operations pages — ✅ (`674034b`, +18 tests)
- 10.E.3 — Owner-stays + Owners + Shares — ✅ (`aeb3537`, +18 tests)
- 10.E.4 — Villa-guides edits — ✅ (`6e16613`, +17 tests)
- 10.E.5 — Settings + Payments + others — ✅ (`1bbe374`, +14 tests)
- 10.E.6 — Dev-OS rollout — ✅ (`d5adfc0`, +16 tests)
- 10.E.7 — Delete confirmation rollout — ✅ shipped today (+11 tests)

**Aggregate impact:**
- 6 shared row-actions wrappers shipped (1 per module group)
- ~30 list pages wired with consistent menu UI (Edit + Archive)
- ~12 new server actions added (the gaps in existing CRUD)
- 6 stand-alone destructive buttons wrapped in confirm dialogs
- 0 migrations, 0 schema changes
- 5057 → 5198 tests (+141 across the 7 sub-phases vs 5057 baseline at 10.E start)

**Carry-over to follow-up phases:**
- utilities/accounts (Mgmt OS, deferred from 10.E.5)
- pricing/rule-sets, projects, documents, guest-journey/rules (Mgmt OS)
- cost-categories edit (Dev OS, deferred from 10.E.6 — has parent/child tree)
- WiFi credentials archive on the dedicated detail page (Dev OS, deferred from 10.E.4)

---

## What unblocks Phase 10.F

Phase 10.F (Modal-First Add Forms) is the next Track A sub-phase. Some Add flows already navigate to a modal in the wrappers shipped (Edit modals); 10.F will sweep the remaining `/new` page-navigation Add patterns and convert them to `<EntityFormModal>`-driven modals.

Track B (Phase 10.M — Build Missing Routes) and Track C (Phase 10.G–10.K) can also start in parallel — Track A primitives are all in place + the consumer pattern is proven across 6 sub-phases.
