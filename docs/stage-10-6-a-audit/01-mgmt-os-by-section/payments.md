# 01 — Mgmt OS / Payments

**Section verdict**: 1 of 4 pages USABLE; 2 confirmed 500s; 1 timeout
(retest pending). The 2 confirmed 500s are P0 must-fix in Phase 10.6.B.

---

## `/dashboard/payments`

**Status**: 🟢 Working
**Severity**: P3
**Source**: `src/app/(dashboard)/dashboard/payments/page.tsx`
- Production: `200` USABLE
- Layout: legacy `<PageHeader>` + table
- Notes: list page works; downstream pages 500.

---

## `/dashboard/payments/providers`

**Status**: 🔴 Broken (production 500)
**Severity**: P0 — payments are revenue-critical
**Source**: `src/app/(dashboard)/dashboard/payments/providers/page.tsx`

- Production: **500 server error** (confirmed twice — main sweep + this report)
- Layout: unknown (page failed to render)
- All actions: blocked by 500

### 3 root-cause hypotheses (per Q6 — operator reproduces server side)
1. **Schema drift** — `payment_providers` table missing OR migration
   0091/0092 introduced a column the loader expects but production
   doesn't have.
2. **Org-scoped data missing** — loader queries
   `WHERE organization_id = $currentOrg` but no row exists for the
   audit-bot org. Should degrade to empty state, not 500. Loader bug.
3. **Permission redirect masquerading as 500** — `requirePermission()`
   call in the page might throw a Next.js redirect that isn't being
   caught, surfacing as a 500.

### Operator action needed
1. Open `/dashboard/payments/providers` in browser.
2. Capture Vercel logs for the request (timestamp + request id).
3. Paste error + stack into this section.
4. AI-coder will diagnose against the 3 hypotheses above + propose fix.

### Recommended action
- **Priority**: P0
- **Sub-phase**: 10.6.B
- **Effort**: ~3h (diagnose + fix + add a regression test that
  loader returns empty array, not throws, when org has no providers)

---

## `/dashboard/payments/providers/new`

**Status**: 🔴 Broken (production 500)
**Severity**: P0
**Source**: `src/app/(dashboard)/dashboard/payments/providers/new/page.tsx`

- Production: **500 server error**
- Likely: same root cause as `/providers` (shared loader or layout).
- Action: fix `/providers` first; this likely heals automatically.

### Recommended action
- **Priority**: P0 (same fix as #2)
- **Effort**: trivial once #2 fixed

---

## `/dashboard/payments/webhooks`

**Status**: 🟡 (timeout in main sweep; needs explicit retest)
**Severity**: P1 if 500 confirmed
**Source**: `src/app/(dashboard)/dashboard/payments/webhooks/page.tsx`

- Production: timed out at 15s; retest at 45s pending CHECKPOINT 3.
- Likely USABLE (matches the pattern of the other 25 timeouts).

### Recommended action
- **Priority**: P2 unless retest confirms 500
- **Sub-phase**: 10.6.B if 500
