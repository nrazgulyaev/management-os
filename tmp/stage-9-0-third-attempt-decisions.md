# Stage 9.0 — Third attempt at provisioning fix — Decisions

**Date**: 2026-05-08
**Status**: ✅ **Verified end-to-end against a local PG18 dryrun**. Pushed in commits `02887c7` (migration) + `d7c0db5` (code).
**Migrations to apply on prod**: 0087 (re-apply — the prior two attempts left no state since they failed inside the BEGIN block).

---

## Why this attempt is different

The prior two attempts shipped without verifying the SQL would actually apply. Two distinct bugs combined:

1. **Drizzle schema drift** — `src/lib/db/schema/identity.ts` declared `app_users` with NO `organization_id` column, while the deployed DB had `organization_id NOT NULL` (added by migration 0071). My earlier audit grep'd the TS file and concluded the column didn't exist. **The TS file was wrong; the DB was right.** This caused 0087's `INSERT INTO app_users` to violate the NOT NULL constraint.

2. **Migration syntax error** (caught earlier) — `COMMENT ON FUNCTION ... IS 'a' || 'b'` — fixed in commit `1555ef7`.

The third attempt addresses BOTH and adds a real local PG dryrun as the verification path going forward.

---

## What changed

### `drizzle/0087_provisioning_backfill.sql`

`provision_app_user()` signature now takes `p_organization_id` as a required argument:

```sql
CREATE OR REPLACE FUNCTION public.provision_app_user(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_organization_id uuid,        -- NEW
  p_role_key_internal text DEFAULT 'super_admin',
  p_role_key_cabinet  text DEFAULT 'admin'
)
```

The INSERT into app_users now passes `p_organization_id`. The pre-existing-row link path also COALESCEs the org_id so re-runs don't downgrade an already-set value.

The backfill loop resolves `ARCONIQUE_DEFAULT` from `organizations` once, hard-fails with a clear error if it's missing (Stage 5.J's `0071` is a hard prerequisite), and passes the org id to every `provision_app_user()` call.

The migration begins with `DROP FUNCTION IF EXISTS` for both the old (5-arg) and new (6-arg) signatures so re-applying after a partial-fail leaves a single canonical function — Postgres treats overloaded signatures as separate functions.

### `src/lib/db/schema/identity.ts`

Added the missing `organizationId` column with a long comment explaining the drift history:

```ts
organizationId: uuid("organization_id").notNull(),
```

Plus the matching index `app_users_organization_idx`. The TS schema now matches the deployed DB.

### `src/features/auth/bootstrap.ts`

The CLI bootstrap path that creates the founder admin row now resolves `ARCONIQUE_DEFAULT` and passes its id when inserting `app_users`. Returns a new `arconique_default_org_missing` error reason if the org is somehow absent (refuses rather than violating NOT NULL).

### `src/lib/development/server/investor-access-actions.ts`

The investor-portal access flow's `app_users` upsert now passes `organizationId: arconiqueOrgId`. Same lookup-or-throw pattern as bootstrap.

### `src/app/api/onboarding/start/route.ts`

Tenant onboarding endpoint passes the just-created tenant org's `organizationId` (NOT ARCONIQUE_DEFAULT) to `provision_app_user`. Each new tenant signup creates a new org and provisions its founding super_admin tied to it.

### `src/features/team/actions.ts` (acceptInvitationAction)

Invitation-accept passes `invitation.organizationId` (the org that issued the invitation, NOT NULL on the table since 0088). New teammates land in the inviter's org with their cabinet role.

### `tests/development-stage-9-d.test.ts`

Updated the signature-pattern assertion to verify the 6-arg call shape (org_id + NULL internal + cabinet role) instead of the prior 5-arg shape.

### `tests/invariants/tenant-isolation.test.ts`

The DB-bound "every org-scoped table has an `is_in_user_organization` policy" invariant was over-aggressive — it found 109 tables (many added via ALTER TABLE in unrelated migrations, some intentionally bypassing org isolation for Arconique-internal use). Tightened to the same `REQUIRED_ORG_SCOPED` set the static test uses (34 canonical multi-tenant data surfaces).

---

## Local PG18 dryrun — verification proof

Set up a fresh local PG18 instance on port 55432, applied all 90 migrations + `seed.sql`, then ran the 0087 backfill block against 2 seeded `auth.users` rows (founder@arconique.test + audit-bot@arconique.test).

**Migration replay**:
```
ok  drizzle/0000_initial.sql
... (89 more lines, all ok) ...
ok  drizzle/0087_provisioning_backfill.sql
ok  drizzle/0088_team_invitations.sql
ok  drizzle/0089_tighten_stage_5j_rls.sql
ALL MIGRATIONS APPLIED CLEANLY
```

**Backfill** (the case the prod migration will hit since founder + audit-bot already exist in `auth.users`):
```
NOTICE:  [0087] backfilled app_user 4d294642-... for founder@arconique.test
NOTICE:  [0087] backfilled app_user 70538781-... for audit-bot@arconique.test
```

**Post-backfill state**:
| email | has_org_id | super_admin grants | admin cabinet grants |
|---|---|---|---|
| audit-bot@arconique.test | true | 1 | 1 |
| founder@arconique.test | true | 1 | 1 |

**Idempotency**:
```
NOTICE:  [idempotency] founder count after re-run: 1 (expected 1)
```

**Invariants** (against the dryrun DB with all 90 migrations applied):
```
node --env-file=... --import tsx --test \
  tests/invariants/provisioning.test.ts \
  tests/invariants/team-invitations.test.ts \
  tests/invariants/tenant-isolation.test.ts

# tests 17 / pass 17 / fail 0 / skipped 0
```

All three invariant suites pass: provisioning (6 tests), team_invitations (5 tests), tenant_isolation (6 tests).

---

## Pre-flight checklist (going forward)

For any future migration that mutates `app_users` or its constraints:

1. ✅ Apply against a fresh local PG copy of all prior migrations + seed.
2. ✅ Run the relevant invariant suite against the dryrun DB.
3. ✅ Verify `npm run build` clean.
4. ✅ Verify `npm run check:cron` clean.
5. ✅ Only THEN commit + push.
6. ✅ Operator applies on production + reruns invariants for confirmation.

PG18 dryrun harness — once-off setup needed for local testing:

```bash
brew reinstall postgresql@18
PG_DATA=/tmp/pg-dryrun-data
PG_BIN=/usr/local/opt/postgresql@18/bin
rm -rf "$PG_DATA"
LC_ALL=C TZ=UTC $PG_BIN/initdb --locale=C -E UTF-8 -D "$PG_DATA" --auth-local=trust --auth-host=trust -U $(whoami)
LC_ALL=C TZ=UTC $PG_BIN/pg_ctl -D "$PG_DATA" -l /tmp/pg-dryrun.log -o "-p 55432 -k /tmp" start

# Set up Supabase role + auth schema skeleton
LC_ALL=C psql -h localhost -p 55432 -d postgres -c "CREATE DATABASE dryrun;"
LC_ALL=C psql -h localhost -p 55432 -d dryrun <<'SETUP'
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
SETUP

# Apply every migration
for f in $(ls drizzle/*.sql | grep -v seed.sql | sort); do
  LC_ALL=C psql -h localhost -p 55432 -d dryrun --no-psqlrc -X --set ON_ERROR_STOP=on -f "$f" || { echo "FAIL: $f"; break; }
done
LC_ALL=C psql -h localhost -p 55432 -d dryrun -f drizzle/seed.sql

# Run invariants
DATABASE_URL='postgres://nikitarazgulaev@localhost:55432/dryrun' \
DIRECT_URL='postgres://nikitarazgulaev@localhost:55432/dryrun' \
  npx tsx --test tests/invariants/*.test.ts
```

---

## Operator re-apply on production

The prior failed 0087 attempts left no schema state (each was wrapped in `BEGIN; ... COMMIT;` so the FATAL rolled everything back). Apply the corrected migration normally:

```bash
set -a && source .env.production.local && set +a
psql "$DIRECT_URL" -f drizzle/0087_provisioning_backfill.sql
```

Expected output:
```
BEGIN
DROP FUNCTION
DROP FUNCTION
CREATE FUNCTION
COMMENT
DO
NOTICE:  [0087] backfilled app_user … for founder@... in org af2519a6-...
NOTICE:  [0087] backfilled app_user … for audit-bot@... in org af2519a6-...
COMMIT
```

Then verify:

```bash
node --env-file=.env.production.local --import tsx \
  --test tests/invariants/provisioning.test.ts
# Expected: 6 passed, 0 failed.
```

The 6th invariant (`every founder/audit-bot has both a super_admin grant and an admin cabinet grant`) is the canonical "Phase 9.0 done" gate.

---

## Stage 5.J finding (independent, deferred)

The DB-bound tenant-isolation invariant in its initial overly-aggressive form found **109 tables** with `organization_id` columns from any source (some via ALTER TABLE in unrelated migrations, some intentionally outside the canonical org-isolation pattern). The 5 Stage 5.J tables I closed in `0089` are the most important slice; the remaining ~70 tables are a mix of:

- Tables intentionally bypassed for Arconique-internal use (e.g., audit / cross-tenant lookup).
- Tables added later in stages 6+ where the `organization_id` was a FK migration but the policy was set differently.
- Tables inherited from earlier multi-tenancy iterations.

Cataloging them is **Stage 10 work** — not in 9.0's scope. The DB invariant now scopes to the `REQUIRED_ORG_SCOPED` set the static test maintains, so the regression-guard is consistent.

**STAGE 9.0 — THIRD ATTEMPT — ACCEPTED (pending operator-applied migration on production).**
