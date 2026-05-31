# DB-STATEMENT-TIMEOUT-1 — statement_timeout hardening (analysis + prepared command)

**Status: NOT APPLIED to production.** This is defense-in-depth (low priority). It must
not be applied blindly — a too-low `statement_timeout` would kill legitimate long queries
(finance report generation, heavy analytics). Run the read-only analysis first, then decide.

## Why

A bounded `statement_timeout` prevents a single runaway / hung query from holding a pooled
connection open indefinitely (which, on the Supabase transaction pooler, can starve the
pool). Today no role/db-level `statement_timeout` is set (verify with the analysis below),
so the effective value is the server default (often `0` = unlimited).

## Step 1 — read-only analysis (run this FIRST)

> The agent's automated read-only probe of prod was blocked by the permission guard
> (prod-DB script). Run this yourself (read-only; safe) — e.g. via `psql "$DATABASE_URL"`
> or the Supabase SQL editor — and check the results before applying anything.

```sql
-- Current effective settings
SHOW statement_timeout;
SHOW idle_in_transaction_session_timeout;
SELECT current_user, current_database();

-- Existing role-/db-level overrides (if any)
SELECT rolname, rolconfig FROM pg_roles WHERE rolconfig IS NOT NULL ORDER BY rolname;
SELECT d.datname, s.setconfig
  FROM pg_db_role_setting s JOIN pg_database d ON d.oid = s.setdatabase;

-- Is pg_stat_statements available? (historical timing)
SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';

-- Legitimate long queries? Anything that has historically run > 30s / > 60s.
-- (max_exec_time / mean_exec_time are in ms on PG13+.)
SELECT round(max_exec_time)::bigint  AS max_ms,
       round(mean_exec_time)::bigint AS mean_ms,
       calls,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query
  FROM pg_stat_statements
 WHERE max_exec_time > 30000
 ORDER BY max_exec_time DESC
 LIMIT 25;

SELECT count(*) FILTER (WHERE max_exec_time > 10000) AS over_10s,
       count(*) FILTER (WHERE max_exec_time > 30000) AS over_30s,
       count(*) FILTER (WHERE max_exec_time > 60000) AS over_60s
  FROM pg_stat_statements;

-- Anything running long right now
SELECT pid, state,
       round(extract(epoch FROM (now() - query_start)))::bigint AS secs,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS query
  FROM pg_stat_activity
 WHERE state = 'active' AND query_start IS NOT NULL
   AND now() - query_start > interval '10 seconds'
   AND pid <> pg_backend_pid()
 ORDER BY secs DESC;
```

## Step 2 — decision rule

- **`over_30s = 0`** (no legitimate query ever exceeds 30s): safe to set a timeout.
  Recommend **60s**, not 30s — leaves headroom for the heaviest legitimate report while
  still killing truly stuck queries.
- **`over_30s > 0`**: inspect those queries first. If they are legitimate (finance
  statement batch, analytics rollups), either (a) set the timeout *above* their real
  ceiling (e.g. 120s), or (b) leave the global role default unbounded and instead set a
  tighter per-transaction `SET LOCAL statement_timeout` in the request path. Do **not**
  apply a blanket 60s that would break them.

## Step 3 — prepared command (DO NOT run until Step 1/2 are clear)

Confirm the application role name from `SELECT current_user` (the role the app connects as
via `DATABASE_URL` — on Supabase this is typically a project-specific role, not `postgres`).
Substitute it for `<APP_ROLE>`:

```sql
-- Apply (idempotent; affects new sessions for this role)
ALTER ROLE "<APP_ROLE>" SET statement_timeout = '60s';
-- Optional companion guard against abandoned open transactions:
ALTER ROLE "<APP_ROLE>" SET idle_in_transaction_session_timeout = '60s';
```

Rollback:

```sql
ALTER ROLE "<APP_ROLE>" RESET statement_timeout;
ALTER ROLE "<APP_ROLE>" RESET idle_in_transaction_session_timeout;
```

Verify after applying (open a fresh connection): `SHOW statement_timeout;` → `60s`.

## Notes
- Setting it at the **role** level (not cluster `ALTER SYSTEM`) keeps the blast radius to the
  app role and is trivially reversible.
- Migrations and long maintenance jobs that legitimately need more should `SET LOCAL
  statement_timeout = '0'` (or a higher value) within their own transaction.
