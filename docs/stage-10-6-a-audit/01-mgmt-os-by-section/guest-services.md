# 01 — Mgmt OS / Guest services

**Section verdict**: 4 pages, all USABLE. Operator flagged catalog
delete as broken.

---

## `/dashboard/guest-services/catalog`

**Status**: 🟡 Half-built (Delete broken)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/guest-services/catalog/page.tsx`

- Production: `200` USABLE
- Edit: works (operator-confirmed)
- Delete: broken (operator-flagged)

### Operator-flagged behaviors
> "/dashboard/villa-guides/services/catalog — Edit works, Delete BROKEN"

### 3 root-cause hypotheses
1. **Same Wi-Fi pattern**: Delete affordance MISSING, not broken
   — file inspection needed at CHECKPOINT 3.
2. **FK constraint**: catalog item has dependent `service_orders`
   rows; delete fails with FK violation; UI shows generic error.
3. **Soft-delete flag missing**: action sets `archived_at` but column
   doesn't exist (schema drift).

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B
- **Effort**: ~2-3h (file inspection + fix or implementation)

---

## Other pages

- `/dashboard/guest-services` 🟢 USABLE
- `/dashboard/guest-services/orders` 🟢 USABLE
- `/dashboard/guest-services/templates` 🟢 USABLE

(Slim format — no operator-flagged behaviors.)
