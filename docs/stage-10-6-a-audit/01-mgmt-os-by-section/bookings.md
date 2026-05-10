# 01 — Mgmt OS / Bookings

Operator flagged 4 broken behaviors here (editability, calendar
new-booking pattern, sync modals, rate plans). All 4 surfaces returned
🟢 `USABLE` in the production sweep — page-load passes; the bugs are
behavioral.

---

## `/dashboard/bookings`

**Status**: 🟡 Half-built (existing bookings allegedly not editable)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/bookings/page.tsx`

- Production: `200` USABLE; CTAs `[+ Manual booking]`
- Layout: legacy `<PageHeader>` + table; no Stage 10.D primitives
  observed
- Add: navigates to `/dashboard/bookings/new` (Modal-First violation;
  see [_modal-first-scan.md](_modal-first-scan.md))
- Edit per row: per operator "existing bookings не editable" — needs
  file inspection to confirm whether (a) edit affordance missing,
  (b) edit affordance present but action broken, (c) intentional
  policy decision (e.g., bookings are immutable once channel-confirmed).
  Action: CHECKPOINT 3 file inspection.
- Delete: pending CHECKPOINT 3 inspection
- Demo data: production check needed

### Operator-flagged behaviors
> "Existing bookings не editable (verify intentional)"

### Recommended action for Phase 10.6.B-F
- **Priority**: P1 — bookings are core-revenue surface; uneditable
  bookings break standard ops (correct guest-name typo, adjust
  check-out time)
- **Target sub-phase**: 10.6.B if confirmed bug; 10.6.F if intentional
  but undocumented
- **Effort**: ~3-6h depending on root cause

---

## `/dashboard/bookings/calendar`

**Status**: 🟡 Half-built (Modal-First violation)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/bookings/calendar/page.tsx`

- Production: `200` USABLE
- File-confirmed: `Link href=".../new"` — same Modal-First Add violation
  as `/dashboard/projects`
- New booking: navigates to `/dashboard/bookings/new` instead of
  opening modal in calendar context

### Operator-flagged behaviors
> "/dashboard/bookings/calendar — 'New booking' navigates к /new (should be modal)"

Confirmed via file-system grep — joins the Modal-First scan as a
known violator.

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B Modal-First batch
- **Effort**: ~1h (covered by shared modal helper)

---

## `/dashboard/bookings/sync`

**Status**: 🟡 Half-built (sync modals not working per operator)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/bookings/sync/page.tsx`

- Production: `200` USABLE (page loads)
- Operator-flagged: sync-trigger modals don't function

### Operator-flagged behaviors
> "Bookings sync modals не работают"

Needs CHECKPOINT 3 file inspection + operator browser-reproduction
(per Q6 — operator reproduces, AI diagnoses from codebase).

3 root-cause hypotheses for "sync modal не работает":
1. **Server-action permission gate** — `requirePermission("bookings.sync")` may not be granted to operator role.
2. **Modal mounted but action returns error** — the channel-manager backend (Booking.com / Airbnb / Vrbo) credentials may be missing for the operator's org.
3. **Modal trigger broken at the client level** — onClick handler not wired or modal-open state not set.

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B
- **Effort**: ~4h (root-cause diagnosis + fix)

---

## `/dashboard/bookings/rates`

**Status**: 🟡 Half-built (rate-plan edit/delete broken; "Enso Base Rate" frozen)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/bookings/rates/page.tsx`

- Production: `200` USABLE
- Operator-flagged: editing or deleting any rate plan named "Enso
  Base Rate" doesn't work; new plan creation works.

### Operator-flagged behaviors
> "/dashboard/rate-plans — 'Enso Base Rate' не editable, не deletable.
> New plan creation works."

3 root-cause hypotheses:
1. **System-managed rate** — "Enso Base Rate" may be a seed row
   that's intentionally protected from edit/delete (would need a
   "system" / "default" badge in UI to make this clear; today it
   silently fails).
2. **Permission scope** — operator role has `rate_plans.create` but
   not `rate_plans.edit`.
3. **Action validation** — server action rejects the row on a
   precondition check (e.g., "rate has bookings attached, cannot
   modify").

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B (if bug) or 10.6.F (if intentional protection
  + need UX clarification)
- **Effort**: ~3h
