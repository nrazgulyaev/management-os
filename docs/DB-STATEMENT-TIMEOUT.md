# DB `statement_timeout` — runbook (founder action) — 2026-06

## Why
On the BYPASSRLS role with no per-statement cap, a runaway/unscoped query runs to
the **300s function timeout** ("empty tenant hangs, not errors"). The big tenancy
sweep (PRs #273–280, ~480 leaks) already org-scoped the readers, so the common
hang is largely gone — but a `statement_timeout` is the durable safety net for any
remaining slow query.

## Why it must be done at the DB, not in code
The app connects through the **Supabase transaction pooler (Supavisor, :6543)**,
which **ignores startup-packet connection params** in transaction mode — verified
in prod (`SHOW statement_timeout` stayed at the default even when set on the
postgres-js client). So a client-side `statement_timeout` is a **no-op here**; the
cap must be set **role-level**. (See the comment in `src/lib/db/client.ts`.)

## What to run (you, against prod)
1. Find the role the app connects as (the pooler username, usually `postgres` or a
   dedicated app role):
   ```sql
   SELECT current_user;            -- run via the SAME connection string the app uses
   SELECT rolname FROM pg_roles;   -- to see the candidates
   ```
2. Set a per-statement cap on that role (recommended **30s** — well above any
   normal page query, far below the 300s function timeout):
   ```sql
   ALTER ROLE <app_role> SET statement_timeout = '30s';
   ```
3. **Long-running paths** (monthly statement cron, bulk imports, big reports) do
   MANY short queries, not one long one, so 30s/statement is safe for them. If any
   single legitimate query genuinely needs longer, raise it **per-statement** in
   that code path: `SET LOCAL statement_timeout = '120s'` inside that transaction —
   do NOT raise the role default.
4. Verify (reconnect first — `ALTER ROLE` applies to NEW sessions):
   ```sql
   SHOW statement_timeout;   -- expect 30s on a fresh app connection
   ```

## Rollback
```sql
ALTER ROLE <app_role> RESET statement_timeout;
```

## Notes
- Start at 30s; if you see legitimate queries tripping it, bump the role to 45–60s
  rather than disabling — a cap below 300s is the whole point.
- This is independent of the app code; no deploy needed.
