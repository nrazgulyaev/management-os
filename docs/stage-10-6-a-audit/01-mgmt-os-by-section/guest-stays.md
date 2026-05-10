# 01 — Mgmt OS / Guest stays

**Section verdict**: 5 pages, all USABLE. Operator flagged tokens as
broken (Add not working).

---

## `/dashboard/guest-stays/tokens`

**Status**: 🟡 Half-built (Add token broken; Revoke works)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/guest-stays/tokens/page.tsx`

- Production: `200` USABLE
- Revoke: works (operator-confirmed)
- Add: broken (operator-flagged)

### Operator-flagged behaviors
> "/dashboard/guest-stays/tokens — Cannot add token. Revoke works."

### 3 root-cause hypotheses
1. **Form action wired but server action throws** — token creation
   requires associating to a `bookings` row + a `villas` row; if
   either lookup returns null the action throws.
2. **Modal opens but submit silent** — modal mounts, form posts,
   action returns ok=false but UI doesn't surface the error.
3. **Permission gate** — `requirePermission("guest_stays.write")` not
   granted to operator role.

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B
- **Effort**: ~2-3h

---

## Other pages

- `/dashboard/guest-stays` 🟢 USABLE
- `/dashboard/guest-stays/finance` 🟢 USABLE
- `/dashboard/guest-stays/preferences` 🟢 USABLE
- `/dashboard/guest-stays/templates` 🟢 USABLE

(Slim format — no operator-flagged behaviors; verdicts from production sweep.)
