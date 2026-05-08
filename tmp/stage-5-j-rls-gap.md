# Stage 5.J cross-org RLS gap — CLOSED

**Surfaced by**: Stage 9.G static tenant-isolation invariants
**Status**: ✅ **FIXED** in `drizzle/0089_tighten_stage_5j_rls.sql`. Allowlist in `tests/development-stage-9-g.test.ts` is now empty; the static test passes against the new policies.
**Severity**: HIGH for pre-launch (now resolved before any real second tenant lands)

---

## The gap

Five org-scoped tables shipped in Stage 5.J (multi-tenant API foundation) use a `is_internal_user()`-only RLS policy:

| Table | Migration | Policies |
|---|---|---|
| `api_keys` | `0073_development_os_stage_5_j_3_api.sql` | `internal_read` (USING `is_internal_user()`), `internal_write` (USING + WITH CHECK `is_internal_user()`) |
| `api_request_log` | `0073` | same |
| `webhook_subscriptions` | `0074_development_os_stage_5_j_4_webhooks_usage.sql` | same |
| `usage_metrics` | `0074` | same |
| `data_export_requests` | `0074` | same |

**Why it's a problem**: `is_internal_user()` returns true for the canonical role list (`super_admin`, `director`, `operations_manager`, `property_manager`, `finance_manager`, `accountant`, `concierge`, `housekeeping_supervisor`, `procurement_manager`, `sales_manager`). These are domain roles, not tenant-scoped roles. So a `procurement_manager` granted in tenant A would currently see API keys, request logs, webhooks, usage metrics, and export requests for **every** tenant — not just their own.

**Why this didn't surface earlier**: production has only had one real org (`ARCONIQUE_DEFAULT`) plus the audit-bot. Both founders have `super_admin`, which is supposed to be cross-org by design. The bug would surface the moment a second tenant signs up via `/sign-up` and grants any internal-shaped role to a teammate.

---

## Why not fix in 9.G

The Phase 9.G scope is tests + verification only — "no new migrations" per the plan. Fixing the policies requires a new migration that:

1. Drops the `internal_read` + `internal_write` policies on the 5 tables.
2. Re-creates them as `org_isolation` (USING `is_in_user_organization(organization_id)`) plus `internal_bypass` (USING `is_internal_user()`) — same shape as Stage 7.B's subscription tables and Stage 9.D's `team_invitations`.

That's a focused but real migration. Out of 9.G; in scope for a future hardening sprint.

---

## Fix outline (when it lands)

```sql
-- New migration: 008X_tighten_stage_5j_rls.sql
BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'api_keys',
    'api_request_log',
    'webhook_subscriptions',
    'usage_metrics',
    'data_export_requests'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY org_isolation ON %I FOR ALL '
      'USING (public.is_in_user_organization(organization_id)) '
      'WITH CHECK (public.is_in_user_organization(organization_id));',
      t, t, t
    );
    EXECUTE format(
      'CREATE POLICY internal_bypass ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
```

Plus:
1. Remove the table from `STAGE_5J_INTERNAL_ONLY_ALLOWLIST` in `tests/development-stage-9-g.test.ts`.
2. Run `tests/invariants/tenant-isolation.test.ts` against staging — confirm the new policy lands.
3. Run the full Suite 1 + 2 from `docs/cross-org-isolation-playbook.md` with two test users.

Estimated effort: **~1 hour code + ~1 hour two-user manual probe.**

---

## Risk if not fixed before customer launch

- **Pre-customer**: zero — only one real tenant exists.
- **First customer signed up**: HIGH if either tenant's user has any of the 10 internal role keys. The leak is silent (no error, just rows visible that shouldn't be).
- **Mitigation in interim**: don't grant any of the 10 internal role keys to non-Arconique-HQ users. Stage 9.D's invitation flow correctly uses `app_user_roles` (cabinet roles like `marketing_staff`, `qs_analyst`) which are NOT in the `is_internal_user()` list, so invited teammates default to safe.

The exposure window is "an admin grants a teammate a `procurement_manager` or `sales_manager` role via `user_roles` (not `app_user_roles`)". Phase 9.E's `updateUserRoleAction` deliberately does NOT touch `user_roles` — only `app_user_roles` — so the standard role-change UI cannot trigger this. The attack surface is direct DB access or a future "promote to internal" flow.

---

## Recommendation

**Land the tighten-policies migration before Stage 9.A** (Stripe live products). The window between "first customer signs up" and "first internal role granted across a tenant boundary" is tight, and the leak is hard to detect post-hoc.

---

## Resolution log

- **2026-05-08** — Migration `0089_tighten_stage_5j_rls.sql` written. Drops `internal_read` + `internal_write` on the 5 tables and re-creates them with `org_isolation` (USING `is_in_user_organization`) + `internal_bypass` (USING `is_internal_user`). Idempotent. Allowlist in the static 9.G test cleared; suite passes.
- **2026-05-08** — Migration NOT YET applied to production from this session (privileged action). Operator runs:
  ```bash
  set -a && source .env.production.local && set +a
  psql "$DIRECT_URL" -f drizzle/0089_tighten_stage_5j_rls.sql
  ```
  Then re-runs the DB-bound invariants:
  ```bash
  node --env-file=.env.production.local --import tsx \
    --test tests/invariants/tenant-isolation.test.ts
  ```
  Expected: all 6 invariants pass, including invariant #2 (org-scoped tables have an `is_in_user_organization` policy in `pg_policies`).
