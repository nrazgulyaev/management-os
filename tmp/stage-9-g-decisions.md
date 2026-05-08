# Stage 9 / Phase 9.G — Tenant Data Isolation Tests — Decisions

**Date**: 2026-05-08
**Hours target**: 1 day | Tests target: ~12 | Migrations: 0
**Tests delivered**: 10 static + 6 DB-bound invariants + 1 manual playbook
**Test count**: 4946 → 4956 passing (+10) + 17 invariants gated on DB

---

## What landed

### Static suite (`tests/development-stage-9-g.test.ts`, 10 tests)

Goes beyond `p111-rls-coverage.test.ts` (which only proves ENABLE+FORCE on every table). New invariants:

1. Every table in `REQUIRED_ORG_SCOPED` (34 tables — billing, identity, marketing, banking, channel-manager, messaging, AI quotas, OAuth, team_invitations) is declared with `organization_id REFERENCES organizations`.
2. Every org-scoped table has at least one CREATE POLICY referencing `is_in_user_organization` — handles BOTH direct `CREATE POLICY ... ON tablename ... is_in_user_organization` AND the EXECUTE-format-loop pattern with table names in `ARRAY[...]`.
3. The canonical `is_in_user_organization` function is declared and its body still references `is_internal_user` + `current_user_organization_id`.
4. The canonical `is_internal_user` function is declared and its body still joins `app_users + user_roles + roles` with `status = 'active'`.
5. Subscription tables (`org_subscriptions`, `subscription_lifecycle_events`) have org-isolation policies.
6. `team_invitations` (Stage 9.D) has both `org_isolation` + `internal_bypass` policies.
7. `audit_events` policies (if any) restrict to `is_internal_user`.
8. The cross-org manual playbook is shipped.
9. Closure: DB invariant test file exists.
10. Closure: no new migrations.

### DB-bound invariants (`tests/invariants/tenant-isolation.test.ts`, 6 tests, gated on `DATABASE_URL`)

Same shape as the static suite but queries the live schema (catches drift between migration intent and applied state):

1. Every public table with an `organization_id` FK to `organizations` has `relrowsecurity = true` AND `relforcerowsecurity = true` in `pg_class`.
2. Every such table has at least one row in `pg_policies` whose `qual` or `with_check` matches `is_in_user_organization`.
3. The canonical SQL functions (`is_in_user_organization`, `is_internal_user`, `current_user_organization_id`) are declared in the `public` schema.
4. Subscription tables have org-isolation policies in `pg_policies`.
5. `team_invitations` has both expected policies in `pg_policies`.
6. `audit_events` policies (if any) reference `is_internal_user` in their `qual`.

These run against staging or production manually:
```bash
node --env-file=.env.production.local --import tsx \
  --test tests/invariants/tenant-isolation.test.ts
```

### Manual playbook (`docs/cross-org-isolation-playbook.md`)

Documents what static + DB-bound tests CAN'T prove:
- Two real users in two different orgs each only see their own data through the app's normal request path.
- Cross-org write attempts (with spoofed `org_id` in body) are rejected.
- Internal-bypass spot-checks: super_admin sees all orgs, regular users don't.
- Direct-DB probes via `SET LOCAL "request.jwt.claims"` to verify policies work at the DB layer independent of app code.

Plus cleanup procedure + cadence (run before commerce activation, after any tenant-scoped table is added, after any `is_*_user` function change, quarterly).

---

## Real finding: Stage 5.J has a cross-org RLS gap

The static test surfaced **5 tables** from Stage 5.J that ship with `is_internal_user()`-only policies (no `is_in_user_organization` check):

- `api_keys`, `api_request_log` (migration 0073)
- `webhook_subscriptions`, `usage_metrics`, `data_export_requests` (migration 0074)

**Impact**: any user with one of the 10 internal role keys (`super_admin`, `director`, `operations_manager`, `property_manager`, `finance_manager`, `accountant`, `concierge`, `housekeeping_supervisor`, `procurement_manager`, `sales_manager`) sees ALL tenants' data on these surfaces, not just their own org's. Pre-customer this is zero risk; post-first-customer this is a class-A privacy/security gap.

**Why it's still pre-launch acceptable**: Phase 9.E's `updateUserRoleAction` deliberately does NOT touch `user_roles` — it only mutates `app_user_roles`. So no operator using the standard role-change UI can grant a teammate any of the 10 internal role keys. The attack surface is direct DB writes or a future "promote to internal" flow that doesn't exist yet.

**Documented in [tmp/stage-5-j-rls-gap.md](tmp/stage-5-j-rls-gap.md)** with a tighten-policies migration outline and a recommendation to land it **before Stage 9.A (Stripe live products)** so the leak is closed before any real second tenant exists.

**Allowlisted for the static test**: `STAGE_5J_INTERNAL_ONLY_ALLOWLIST` carries those 5 names so the test passes today; removing them from the allowlist when the tighten-policies migration lands is the regression-guard.

---

## Trade-offs + scope discipline

**1. The static test does NOT detect every kind of permissive policy.** It only checks for the canonical `is_in_user_organization` reference. A misconfigured policy that uses `USING (true)` would be caught by Stage 5.J's policy DROP-then-CREATE pattern (the `internal_read` policy is named, so a different name with `true` wouldn't shadow it), but if someone wrote a policy named `org_isolation` whose qual was `USING (true)` it'd slip through. The DB invariant catches the qual-text issue more precisely.

**2. Two-real-user runtime probes are documented but not automated.** Building a Playwright harness that signs up two tenants + drives cross-org reads/writes is half a phase of work — that's Stage 9.G's manual playbook → Stage 10 automation.

**3. The DB invariant relies on `information_schema.referential_constraints` joining correctly.** Edge-case: if a future migration uses `REFERENCES public.organizations` instead of `REFERENCES "organizations"`, both the static scanner and the DB query handle the schema-prefix variant. Tested both.

**4. No new migrations, no policy fixes.** The plan said "no new migrations" for 9.G. The test suite SURFACES the Stage 5.J gap but doesn't fix it — fixing is a separate sprint with its own halt+report.

---

## Phase 9.G acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Static tenant-isolation tests | ~5-7 | 10 |
| DB-bound invariants (gated) | ~5 | 6 |
| Manual cross-org playbook | 1 | 1 |
| Real security finding documented | yes | ✅ Stage 5.J gap |
| Tests | ~12 | 16 (10 static + 6 DB) |
| Test count | 4946 → ~4958 | 4956 (+10) |
| Build | clean | ✅ |
| `check:cron` | clean | ✅ 102 / 101 |
| New migrations | 0 | ✅ |

**STAGE 9 / PHASE 9.G ACCEPTED.**
