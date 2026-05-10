# 01 — Mgmt OS / Maintenance intelligence

**Section verdict**: 5 pages, all USABLE. Operator flagged 3 behaviors:
plans "Generate due tasks" server error (see
[`maintenance-intelligence-plans.md`](maintenance-intelligence-plans.md)),
templates Delete missing, risk-feed Scan not working.

---

## `/dashboard/maintenance-intelligence/templates`

**Status**: 🟡 Half-built (Delete missing per operator)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/maintenance-intelligence/templates/page.tsx`

- Production: `200` USABLE
- Add: works (operator-confirmed)
- Delete: missing (operator-flagged)

### Operator-flagged behaviors
> "/dashboard/maintenance/templates — Add works, Delete MISSING"

Same pattern as Wi-Fi — likely the Delete affordance was never built.
Templates feed `villa_maintenance_plans`; deletion would need a guard
("template has active plans, archive instead").

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B
- **Effort**: ~3h (server action + RowActionsMenu Archive button +
  ConfirmDialog + active-plan guard)

---

## `/dashboard/maintenance-intelligence/risk-feed`

**Status**: 🟡 Half-built (Scan risks not working per operator)
**Severity**: P1
**Source**: `src/app/(dashboard)/dashboard/maintenance-intelligence/risk-feed/page.tsx`

- Production: `200` USABLE (page loads)
- "Scan risks" button: not functional per operator

### Operator-flagged behaviors
> "/dashboard/maintenance/risk-feed — 'Scan risks' not working. View status unclear."

### 3 root-cause hypotheses
1. **Cron job exists but manual trigger broken** — server action
   `runRiskFeedScan()` may exist but UI button isn't wired to it.
2. **Action calls AI agent** — risk-feed depends on the
   `risk-detection` AI agent which might not be enabled in prod
   (per Stage 10.5.B — per-org agent config).
3. **Data dependency** — scan needs `maintenance_risk_events` source
   data which is empty in production.

### Recommended action
- **Priority**: P1
- **Sub-phase**: 10.6.B if button broken; 10.6.F if needs deep
  algorithm + AI integration work
- **Effort**: ~3-6h depending on root cause

---

## Other pages

- `/dashboard/maintenance-intelligence` 🟢 USABLE
- `/dashboard/maintenance-intelligence/plans` — full report at [`maintenance-intelligence-plans.md`](maintenance-intelligence-plans.md)
- `/dashboard/maintenance-intelligence/templates` — see above
- `/dashboard/maintenance-intelligence/risk-feed` — see above
- `/dashboard/maintenance-intelligence/window-suggestions` 🟢 USABLE (algorithm doc carry-over to 10.6.F per `_business-logic-questions.md` Q14)
