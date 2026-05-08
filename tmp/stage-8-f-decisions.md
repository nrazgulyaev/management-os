# Stage 8 / Phase 8.F — Provisioning Pipeline Fix — Decisions

**Date**: 2026-05-08
**Hours target**: 1-1.5 days | Tests target: ~+15-20 | Migrations: 1 (0087)
**Tests delivered**: 16 static + 6 DB-bound invariants (skipped without `DATABASE_URL`)
**Test count**: 4898 → 4914 passing (+16), plus 6 invariants gated on DB.

---

## Reconciling the prompt with actual schema

The prompt asserted `app_users` had `organization_id NOT NULL`. Schema audit showed otherwise — `app_users` has only `auth_user_id`, `email`, `full_name`, `phone`, `whatsapp_phone`, `prefers_whatsapp`, `avatar_url`, `status`, `timezone`, `investor_id`, `created_at`, `updated_at`. **Multi-tenancy lives on individual data tables (`api_keys`, `bookings`, etc.), not on `app_users`.** This shaped two decisions:

1. The migration does NOT set `app_users.organization_id`. The column doesn't exist; adding it would be an out-of-scope schema change.
2. The onboarding endpoint creates an `organizations` row but doesn't link it back to `app_users`. The link is implicit via `app_user_roles` grants (which CAN be `scope='project_specific'` with a `scoped_project_id`) and via the per-table `organization_id` columns the user populates downstream.

The prompt also assumed `app_user_roles` is the only RBAC table. Actual schema has TWO RBAC tables, both must be populated for founders/audit-bot to function:

- `user_roles` (joins to `roles.id`) — drives `is_internal_user()` SQL function for RLS bypass.
- `app_user_roles` (text `role_key`) — drives Stage 5.F cabinet routing.

`scripts/bootstrap-admin.ts` writes to the first only. Phase 8.F's `provision_app_user()` writes to BOTH so a single call leaves the chain consistent.

---

## 8.F.1 — Migration `0087_provisioning_backfill.sql` — DELIVERED

**Function**: `public.provision_app_user(auth_user_id, email, full_name, role_key_internal, role_key_cabinet)` returns `uuid`. SECURITY DEFINER + `SET search_path = public`. Idempotent on every step:
1. Find existing `app_users` row by `auth_user_id` → return its id.
2. If absent, find an unlinked pre-provisioned row by lowercased `email` → link `auth_user_id` to it.
3. If still absent, insert a fresh row.
4. Grant `super_admin` via `assign_user_role(...)` (writes to `user_roles`; existing helper handles its own idempotency).
5. Grant `'admin'` (or whatever `role_key_cabinet` is passed) via `app_user_roles` if not already active for that user.
6. Returns the `app_users.id`.

**Backfill loop**: iterates `auth.users` rows that have no matching `app_users`, derives a sensible `full_name` from the email local-part (`initcap` + replace `[._-]` with space), and calls `provision_app_user()`. Logs every backfill to `audit_events` with action `auth.app_user.backfilled`. The whole migration is wrapped in a single `BEGIN;...COMMIT;` so a failure rolls back cleanly.

**Production state at authoring time**: 2 rows expected to backfill (`nrazgulyaev@gmail.com`, `audit-bot@arconique.com`). The loop is open-ended so additional auth users created during dev/staging since are picked up too.

## 8.F.2 — `scripts/bootstrap-admin.ts` verification — DELIVERED

After `linkSupabaseUserToSuperAdmin()` returns ok, the script now:
1. Reads back `app_users` by `auth_user_id`. Hard-fails (`exit 2`) if absent.
2. Reads back the `user_roles` + `roles` join. Hard-fails if no `super_admin` grant.
3. Reads back `app_user_roles`. **Soft-warns** if no active grant (the cabinet grant is provisioned by 0087 or by `/api/onboarding/start`, not by bootstrap-admin itself, so its absence isn't a fatal bootstrap regression — but we surface it loudly).

Phase 0's silent-failure mode (auth user created but no app_users) is now impossible — the bootstrap script refuses to exit 0 unless every link is verified.

## 8.F.3 — `/api/onboarding/start` — DELIVERED

POST handler at `src/app/api/onboarding/start/route.ts`. Flow:

1. Read body — supports both JSON and `application/x-www-form-urlencoded`.
2. Validate via Zod. Schema accepts BOTH camelCase (matches existing `/sign-up` form fields: `orgName`, `orgSlug`, `planCode`, `fullName`) AND snake_case (canonical for HTTP APIs). A `normalize()` helper picks whichever is present.
3. Pre-flight uniqueness — reject duplicate `org_slug` (organizations.organization_code = `ORG_<UPPER_SLUG>`) with 409 + a `fieldErrors.org_slug` message.
4. Reject unknown `plan_code` against `subscription_plans`.
5. Create the Supabase Auth user via the admin SDK. `email_confirm: true` so the user can sign in immediately. If Supabase reports "already registered", return 409 + `fieldErrors.email`.
6. Insert `organizations` row.
7. Call `provision_app_user(auth_user_id, email, full_name, 'super_admin', 'admin')` to create `app_users` + both grants atomically.
8. Insert `org_subscriptions` row at the requested plan with a 14-day trial window.
9. Insert two `audit_events` rows: `org.create` + `auth.user.provisioned`.
10. Respond:
    - **JSON client** (`Accept: application/json` or `Content-Type: application/json`) — JSON body `{ ok, app_user_id, organization_id, redirect_url }`.
    - **Browser form submit** — 303 redirect to `/login?onboarded=1&email=<email>`.

**Rollback**: any failure after the auth user is created triggers `admin.auth.admin.deleteUser(authUserId)` so we never leave an orphan in `auth.users`.

**Why redirect to /login instead of /dashboard**: the Supabase admin `createUser` API does NOT set a session cookie on the response. The user is created but not logged in. Redirecting to `/dashboard` would bounce off the auth gate. Redirecting to `/login?onboarded=1&email=...` lets the form pre-fill the email and (in a future stage) show a "Workspace created — sign in below" banner.

**Stripe integration deferred**: the prompt explicitly excluded it — "DON'T add Stripe creation в onboarding (Stage 9.B handles that)". Trial billing cycle is recorded in `org_subscriptions` but no Checkout session, no Stripe Customer, no webhook. That all lives in Stage 9 commerce activation alongside the missing Customer Portal.

**Email verification deferred**: `email_confirm: true` skips it. Adding magic-link verification is a Stage 9 add-on — the existing flow lets the operator log in immediately for trial.

## 8.F.4 — `/sign-up` form — DELIVERED

Form fields aligned to the endpoint schema:
- `email` (existing)
- `password` (NEW — Supabase requires it for password sign-in)
- `fullName` (NEW — feeds `app_users.full_name` instead of falling back to email)
- `orgName`, `orgSlug`, `planCode` (existing)

The form `action="/api/onboarding/start"` was already correct (it just pointed at a missing route). Form posts as `application/x-www-form-urlencoded` and the endpoint handles that via `formData()` + `normalize()`.

## 8.F.5 — Tests — DELIVERED

**Static tests** (`tests/development-stage-8-f.test.ts`): 16 file-presence + grep assertions covering the migration shape, bootstrap-admin verification block, endpoint shape, and form field alignment.

**DB-bound invariants** (`tests/invariants/provisioning.test.ts`): 6 SQL invariants gated on `DATABASE_URL`. They skip cleanly in static-only CI and run against staging or production via:

```bash
node --env-file=.env.production.local --import tsx \
  --test tests/invariants/provisioning.test.ts
```

Invariants:
1. Every `auth.users` has a matching `app_users`.
2. Every active `app_users` has at least one grant in `user_roles` OR `app_user_roles`.
3. Every active `app_user_roles.role_key` is in the CHECK list.
4. Every active `app_user_roles` references an existing `app_users`.
5. Every `user_roles` row resolves to an existing `roles` row.
6. Both founders (`nrazgulyaev@gmail.com`, `audit-bot@arconique.com`) have BOTH a `super_admin` grant in `user_roles` AND an active `admin` grant in `app_user_roles`.

The 6th invariant is the canonical "did Phase 8.F do its job" check — running it post-migration on production is the acceptance signal that the founder + audit-bot are fully functional.

---

## Phase 8.F acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Migration written | 1 | ✅ `drizzle/0087_provisioning_backfill.sql` |
| `provision_app_user()` SQL function | 1 | ✅ idempotent, atomic, SECURITY DEFINER |
| Backfill loop logs to `audit_events` | yes | ✅ |
| `bootstrap-admin.ts` verifies downstream rows | yes | ✅ |
| `/api/onboarding/start` endpoint | 1 | ✅ |
| `/sign-up` form aligned to endpoint | yes | ✅ + password + fullName added |
| Static tests | ~10-15 | 16 |
| DB invariants | 5 | 6 (gated on DATABASE_URL) |
| Build | clean | ✅ |
| `check:cron` | clean | ✅ 102 / 101 |

**Migration NOT applied to production from this session** — applying schema changes to prod is a privileged operation outside this session's authorization scope. The migration file is committed; the user runs it on their end via:

```bash
set -a && source .env.production.local && set +a
psql "$DIRECT_URL" -f drizzle/0087_provisioning_backfill.sql
```

Once applied, the user runs the invariants to verify:

```bash
node --env-file=.env.production.local --import tsx \
  --test tests/invariants/provisioning.test.ts
```

Expected: all 6 invariants pass, including the founder-grants check.

**STAGE 8 / PHASE 8.F ACCEPTED (pending operator-applied migration).**
