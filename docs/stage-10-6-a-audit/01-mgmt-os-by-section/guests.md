# 01 — Mgmt OS / Guests

**Section verdict**: 1 page, USABLE. Operator-flagged as not-editable.

---

## `/dashboard/guests`

**Status**: 🟡 Half-built (read-only by design? Or edit affordance missing?)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/guests/page.tsx`

- Production: `200` USABLE
- CTAs: pending file inspection
- Operator-flagged: "Guests not editable, just phone numbers visible"

### Operator-flagged behaviors
> "/dashboard/guests — Guests не editable. Just phone numbers visible."

The "phone numbers only" hint suggests the page renders a single
column of `guests.phoneNumber` and nothing else — the full guest
record (name, nationality, email, notes, history) isn't surfaced.
This could be intentional privacy design (PII minimization) or a
half-built listing.

### 3 root-cause hypotheses
1. **Privacy minimization** — guests table includes PII; only phone
   numbers shown to avoid casual exposure. Edit requires a separate
   `/dashboard/guests/[id]` route. Acceptable design but UX should
   make this discoverable ("Click to view full record").
2. **Incomplete list page** — Stage X built the listing as a
   placeholder; full form / row-level Edit was never wired.
3. **Permission filtering** — operator role can read phoneNumber but
   not write any field; UI hides Edit button conditionally.

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B if confirmed bug; 10.6.F if intentional but
  needs UX clarification.
- **Effort**: ~2-4h
