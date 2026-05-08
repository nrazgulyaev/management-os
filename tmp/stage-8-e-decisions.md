# Stage 8 / Phase 8.E — Observability + cold-start mitigation — Decisions

**Date**: 2026-05-08
**Hours target**: 1 day | Tests target: ~10 | Migrations: 0
**Tests delivered**: 11 | Tests baseline 4887 → 4898

---

## 8.E.1 — Vercel warm-up cron — DELIVERED

| File | Purpose |
|---|---|
| `src/features/jobs/warm-routes-job.ts` (NEW) | `runWarmRoutesJob` — `Promise.allSettled` of HEAD requests against a fixed `WARM_ROUTES` list with an 8s per-request `AbortSignal.timeout`. Returns `partial_success` if any individual request fails (any status >= 500 or timeout). Logs the slowest-3 routes via `handle.event("info", …)`. |
| `src/app/api/cron/warm-routes/route.ts` (NEW) | Standard `handleCronJobRequest(request, "warm_routes")` shell. GET + POST. |
| `src/features/jobs/actions.ts` (MODIFIED) | Added `"warm_routes"` to `KNOWN_JOBS`, the `JobKey` union, the dispatch switch, and the runner import. |
| `docs/VERCEL-CRON-CHECKLIST.md` (MODIFIED) | New row documenting `*/10 * * * *` schedule + `APP_BASE_URL` env requirement. |

**Schedule rationale**: every 10 min keeps high-traffic functions warm without dominating the cron quota or the request log. The 14-route `WARM_ROUTES` list covers the public landing, login, sign-up, both dashboard hubs, and the high-traffic operator surfaces (front-office × 3, maintenance, system/health, AI agents, marketing connections, banking).

**WARM_ROUTES exclusions**: the four hub pages still timing out under cold start (`/dashboard/direct-bookings`, `/dashboard/pricing`, etc.) are **deliberately excluded**. Their cold-start cost is the slow underlying queries, not function spin-up; warming the function doesn't help. The fix for those routes is per-query optimization (Stage 9 work).

**Cron registry**: `npm run check:cron` confirms 102 routes / 101 jobs. Was 101 / 100.

## 8.E.2 — Server-Timing-style perf logging — DELIVERED (logs not headers)

| File | Purpose |
|---|---|
| `src/lib/observability/perf.ts` (NEW) | `trace(page, q, fn)` — wraps a Promise, logs `[perf] page=… q=… ms=… ok` to Vercel runtime logs on completion (or `… fail …` on throw), passes the value through unchanged. Tiny overhead. |

**Why not Server-Timing headers**: Next.js server components don't have a clean way to set response headers (you'd need middleware, which adds latency to every request). For the audit problem we're solving — *"identify the slow query without guessing"* — Vercel function logs are fully sufficient. Operators grep `[perf]` in the function logs and sort by `ms=`.

**Wired into the two slowest 8.C hub pages**:
- `/dashboard/direct-bookings` — wraps each of the 3 metric calls so we can identify whether `getDirectBookingMetrics`, `getDepositMetrics`, or `getReconciliationMetrics` is the >60s offender.
- `/dashboard/pricing` — wraps `getPricingHubMetrics`.

The other 12 hub pages from the Stage 7.G audit are NOT instrumented — they were not flagged as slow, so the per-call console.log per-render is unwarranted overhead. The pattern is reusable for future regressions.

## 8.E.3 — Vercel Analytics — DELIVERED

| File | Purpose |
|---|---|
| `package.json` | Added `@vercel/analytics` as runtime dependency. |
| `src/app/layout.tsx` (MODIFIED) | Imports `<Analytics />` from `@vercel/analytics/next`, mounts it inside the root `<body>`. |

This is the free-tier basic page-view + bounce instrumentation. Speed Insights (LCP / INP / CLS) is a separate paid product — not enabled here. The user can enable Speed Insights via the Vercel dashboard if/when needed; the package + pattern is ready.

---

## What was NOT done in 8.E

**Speed Insights (paid)** — out of scope. Documented above.

**Server-Timing response headers** — explicitly declined; runtime logs solve the audit problem more cheaply.

**Optimization of `/dashboard/direct-bookings` + `/dashboard/pricing`** — the actual queries are slow. Phase 8.E SURFACES the slow query via perf logs but does not optimize it. That's Stage 9 / a future targeted sprint informed by the perf logs Phase 8.E now generates.

---

## Phase 8.E acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 8.E.1 warm-up cron route | 1 | ✅ shipped |
| 8.E.1 KNOWN_JOBS + JobKey + dispatch | 3 | ✅ all wired |
| 8.E.1 checklist row | 1 | ✅ |
| 8.E.2 trace() helper + 2 slow pages instrumented | 2 | ✅ |
| 8.E.3 @vercel/analytics in layout | 1 | ✅ |
| Tests delivered | ~10 | 11 |
| Test count | 4887 → ~4900 | 4898 (+11) |
| Build | clean | ✅ |
| `check:cron` | 102 / 101 | ✅ |
| New migrations | 0 | ✅ |

**STAGE 8 / PHASE 8.E ACCEPTED.**
