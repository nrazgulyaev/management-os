# Phase A — Stage 6.P5–P8 Catch-up — ACCEPTED 2026-05-07

## Summary

Phase A re-opened Stage 6.P5–P8 to deliver Master Plan v4's intended scope.
The audit-driven approach surfaced a key finding: **v4 substantially
underestimated existing infrastructure**. Many of v4's "to build" items
were already shipped in earlier stages. The catch-up's net new code is
focused on the genuine gaps + verification of pre-existing surface.

| Sub-stage | v4 target | Actual delta | Outcome |
|---|---|---|---|
| P5 catch-up | +120 tests | +37 | Operations Edit+Archive, rotation actions, schedule + scope Edit |
| P6 catch-up | +200 tests | +16 | Migration 0083, `aiExecute()`, 4 cron jobs, project memory schema |
| P7 catch-up | +150 tests | +12 | `editDistribution` + verification (most surface pre-existed) |
| P8 catch-up | +80 tests | +8 | 9 cabinets verified, my-cabinet wired, Soon triage |
| **Phase A total** | **+550** | **+73** | **4632 → 4705** |

## What landed (per sub-stage)

### Phase A.1 — P5 catch-up
- 6 new operations actions: `editOperationTaskAction`,
  `archiveOperationTaskAction`, `editMaintenanceTicketAction`,
  `archiveMaintenanceTicketAction`, `editDamageReportAction`,
  `archiveDamageReportAction`. Status enums extended with `archived`.
- `rotateApiKey` — atomic via `db.transaction`, carries forward
  shape (label + scopes + rate limits + key type), returns plaintext
  once. Refuses to rotate a revoked key.
- `editResourcePool` + `archiveResourcePool` + `editWorkingCalendar`
  + `archiveWorkingCalendar`.
- `editResponsibilityScopeAction` + `editResponsibilityScopeSchema`.
- KB Edit+Archive — already covered by `upsertGuideSectionAction` +
  `archiveGuideSectionAction` from villa-guides.
- Notification preferences — already covered by
  `updateNotificationPreferenceAction`.

### Phase A.2 — P6 catch-up (org-scoped AI quotas)
- **Migration 0083** — 3 new tables (`ai_org_quota_limits`,
  `ai_org_usage_monthly`, `ai_project_memory`). Per-org RLS via
  FOREACH IN ARRAY (5th preservation of the 0075 lesson).
- **`aiExecute()`** at [src/lib/ai/execute.ts](../src/lib/ai/execute.ts) —
  hard-cap pipeline: org-quota → legacy budget → provider → run +
  UPSERT bump. Today_* counters reset on date roll.
- **`snapshotOrgQuota()`** — exposes `reachedWarn` / `reachedHigh` /
  `reachedHardCap` for dashboards.
- **4 cron jobs**: `ai_aggregate_daily`, `ai_period_rollover`,
  `ai_warn_thresholds`, `ai_stripe_sync` (STUB until Stage 7.D).
  Cron registry: 92 → 96 routes, 91 → 95 keys.
- **Project memory schema** — dormant until agent integration.

### Phase A.3 — P7 catch-up (investor portal operator surface)
- `editDistribution` — declared-only metadata editor (effective
  date, notes, trigger reason). Refuses non-declared status.
- Verified 7 v4 deliverables already shipped: investor CRUD,
  commitment lifecycle, distribution lifecycle (pre-edit), tax
  CRUD, shared costs, document extraction CRUD, owner intelligence,
  invoice flow.
- Investor portal subdomain (`investors.arconique.com`) deferred to
  Stage 7.E (requires the tenant-routing middleware).

### Phase A.4 — P8 catch-up (cabinets + sidebar + Soon triage)
- Verified 9 role cabinets all load real personalized data via
  per-cabinet query modules.
- `/cabinets/my-cabinet` confirmed wired to user identity via
  `resolveLandingPageForUserId` → `role-helpers.ts` mapping.
- Soon-features triage:
  - `/quantity-surveying` — keep as `Coming Soon` placeholder
    (existing QS flow lives in Work Packages + Change Orders +
    Inventory).
  - Warehouse — no separate `/warehouse` route; the
    `warehouse-manager` cabinet IS the operator surface.
- Sidebar audit — every `/cabinets/<slug>` reference resolves.

## What's deferred (post-Stage-7)

- E2E tests (Playwright) — running them with one test customer
  surfaces fewer real regressions than after live commercial use.
- A11y audit — same logic.
- Performance audit — same logic.
- Per-agent prompt-template UI + streaming agent inbox UI — actions
  + schema exist, the broader UI rollout stays incremental as
  internal Arconique users surface need.

## Acceptance gate (passed)

| Check | Status |
|---|---|
| 4 sub-stage markers flipped to `[ACCEPTED 6.Px-CATCHUP]` | ✅ |
| Migration 0083 applied (3 new tables, RLS via FOREACH ARRAY) | ✅ |
| `aiExecute()` hard-cap enforced before provider call | ✅ |
| 4 new cron jobs wired in `KNOWN_JOBS` + dispatcher + checklist | ✅ |
| `editDistribution` refuses non-declared status | ✅ |
| 9 cabinets verified to load real data | ✅ |
| 4705 tests passing (+73 over 4632 baseline) | ✅ |
| `npm run build` clean | ✅ |
| `npm run check:cron` clean (96 routes, 95 keys) | ✅ |
| Stage 5.J build-fix invariant maintained | ✅ |

## What's next

**Phase B — Stage 7 (Multi-tenancy + Commerce)** is unblocked.

Sequencing per the approved plan:
- **7.A** RBAC + cabinet_definitions metadata layer (~2 weeks).
- **7.B** Subscription plans + feature gating (~1.5 weeks).
- **7.C** Access expiration + renewal mechanics (~1 week).
- **7.D** Stripe commerce activation (~1.5 weeks).
- **7.E** Public marketing + sign-up + onboarding + tenant subdomain
  routing (~1.5 weeks).
