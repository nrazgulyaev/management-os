# /dashboard/system/health — production hang deep-dive

**Audit run**: 2026-05-07
**Verdict**: 🔴 BROKEN
**Symptom**: page never returns; curl times out at 60s; Playwright DOM-content-loaded times out at 30s.

## Root cause

[src/app/(dashboard)/dashboard/system/health/page.tsx:97-122](../src/app/(dashboard)/dashboard/system/health/page.tsx#L97-L122) fires **39 parallel `SELECT COUNT(*)` queries** in a single page render via `Promise.all`:

```ts
const TRACKED_TABLES = TRACKED_TABLE_GROUPS.flatMap((g) => g.tables); // 39 tables
const counts = await Promise.all(
  TRACKED_TABLES.map(async (t) => {
    const result = await safeCount(`count:${t}`, async () =>
      db.execute(sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(t)}`),
    );
    return { table: t, result };
  }),
);
```

On Vercel + Supabase serverless cold-start, the per-function postgres pool has limited connection slots (typically ≤10). 39 simultaneous COUNT queries either:
1. Saturate the pool → queries queue → cumulative latency exceeds page timeout
2. Trigger Supabase's per-IP / per-pool connection limit → some queries hang waiting for connections that never free

Direct curl confirms: a single `/dashboard/system/health` request hangs >60s without a response.

Other dashboard pages (e.g. `/dashboard/owners`, `/dashboard/shares`) issue 1-3 queries and return in <2s, so postgres connectivity itself is fine — this is specifically a fan-out problem.

## Fix complexity: MEDIUM (1-3h)

**Option A — single batched query** (preferred)
```sql
SELECT 'app_users' AS t, COUNT(*) AS c FROM app_users
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'permissions', COUNT(*) FROM permissions
... (one row per tracked table)
```
One round-trip, no pool pressure. Materialize the SQL via a TS helper that walks `TRACKED_TABLE_GROUPS`. Need a fallback for missing tables (catch + report `not_found`).

**Option B — bounded parallelism**
Use `p-limit` or a hand-rolled semaphore with `concurrency: 4`. Lower latency than serial; safer than 39-way fan-out.

**Option C — defer to a cron job**
Health metrics aren't strictly real-time. A daily/hourly cron that writes to a `system_health_snapshots` table and the page reads the latest row. Removes any per-render DB load.

Option A is the right call — single query, predictable latency, no schema change.

## Reproduction

```bash
curl --max-time 60 https://management-os-fawn.vercel.app/dashboard/system/health
# → status=000 time=60.006086s (timeout, no response)
```

## Sibling pages

The same `safeCount` helper is used elsewhere but never with this fan-out. No related hangs detected in the audit sweep.
