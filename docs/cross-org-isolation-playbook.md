# Cross-org isolation — manual verification playbook

**Stage 9.G**
**Status**: SOP for QA / security review
**Companion tests**:
- Static: `tests/development-stage-9-g.test.ts` (no DB)
- DB-bound: `tests/invariants/tenant-isolation.test.ts`

---

## Why a manual playbook

The static + DB-bound test suites prove three things:

1. Every org-scoped table (`organization_id REFERENCES organizations`) has `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.
2. Every such table has at least one policy referencing `is_in_user_organization(...)`.
3. The canonical SQL functions (`is_in_user_organization`, `is_internal_user`, `current_user_organization_id`) remain declared with the expected join shape.

What they CANNOT prove statically:

4. Two different real users in two different orgs each ONLY see their own data when querying through the application's normal request path.
5. A user in org A cannot trigger a server action that mutates org B's data.

(4) + (5) require live two-user E2E and are documented here.

---

## Prerequisites

- **Two test orgs** in production (or a sandbox tenant). The simplest setup:
  - Org A: `Arconique Internal Audit` (slug `arconique-audit`) — already provisioned via Phase 0.
  - Org B: a freshly-created tenant via `/sign-up`. Pick an unused email (e.g., `tenant-b-test@arconique.com`).
- **Two browser sessions**, one per user — Chrome profile A + Chrome profile B (or two private windows in different browsers). Do NOT share session cookies.
- **One support session with super_admin** (the audit-bot or the founder) to seed test data into Org B and to verify cleanup.

## Suite 1 — read isolation

For each surface in the table below, perform the steps in two sessions (User A in org A, User B in org B) and confirm each user sees ONLY their own org's data.

| Surface | What user A should see | What user B should see |
|---|---|---|
| `/dashboard/projects` | Org A's projects | Org B's projects (none yet on a fresh tenant) |
| `/dashboard/owners` | Org A's owners | Empty list |
| `/dashboard/bookings` | Org A's bookings | Empty list |
| `/dashboard/settings/team` | Org A's team + pending invitations | Org B's team + pending invitations |
| `/dashboard/billing` | Org A's subscription (if shipped) | Org B's subscription |
| `/development-os/marketing/connections` | Org A's marketing connections | Empty list |
| `/development-os/banking` | Org A's bank connections | Empty list |
| `/development-os/ai-agents/inbox` | Org A's agent outputs | Empty list |
| `/dashboard/audit` | Org A's audit events | Empty list |

**Pass criteria**: every surface returns rows scoped to the caller's org. No cross-org row visible.

**Common failure mode**: a developer added a new tenant-scoped table without an RLS policy → User B sees rows from User A's org. The DB invariant test catches this when run against the deployed schema; this manual probe is the belt-and-braces for cases where the tests pass but a query path bypasses RLS (e.g., a service that uses the service-role client unnecessarily).

## Suite 2 — write isolation

For each mutation, attempt to write to org B's data while authenticated as User A. Each attempt MUST fail.

| Attempt | Expected result |
|---|---|
| User A submits the team-invite form on `/dashboard/settings/team` with a target `org_id` from org B (intercept the request and tamper) | The action ignores the spoofed org_id (resolves via ARCONIQUE_DEFAULT or the auth context) — invitation lands in org A, not B. |
| User A invokes the role-change action with a `userId` belonging to org B | `requirePermission("roles.assign")` passes (user A is super_admin). The DB query fails because the target user_id is in org B and either (a) the action's lookup returns null and the action returns "User not found", or (b) the RLS-protected `app_user_roles` insert is rejected. |
| User A POSTs to `/api/team/invite` with org B's organization_id in the body | Same outcome — the action resolves org via the auth context, not the body. |
| User A invokes a server action that ultimately writes to a marketing_connections row owned by org B | The RLS WITH CHECK clause rejects the row insert/update; the action's catch returns a generic "could not save" error. |

**Pass criteria**: every spoofed-org write either no-ops or returns an error. No row in org B is mutated by user A.

## Suite 3 — internal-bypass spot-checks

The `is_internal_user()` function returns true for users in `user_roles` joined to `roles` where the role key is in the canonical internal list (super_admin, director, etc.). Internal users get RLS bypass via `USING (is_internal_user())` on each policy.

| Attempt | Expected result |
|---|---|
| Audit-bot (super_admin) reads org A's bookings | Sees them — bypass works. |
| Audit-bot reads org B's bookings | Sees them — bypass works. |
| User B (no super_admin) reads org A's bookings | RLS denies — empty result. |

**Pass criteria**: super_admin can cross orgs (intentional), regular users cannot.

If User B can read org A's data, either (a) `is_internal_user()` is misconfigured, or (b) one of User B's grants accidentally landed in `user_roles`. Both are class-A regressions.

## Suite 4 — direct-DB probes

These run against Postgres directly with two different role contexts. Useful to verify the policies are correctly enforced at the DB layer (independent of the app code).

```sql
-- As role 'authenticated' with auth.uid() set to user A:
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<user-a-auth-uuid>"}';
SELECT count(*) FROM public.team_invitations;
-- Expected: only org A's pending invitations.

SET LOCAL "request.jwt.claims" = '{"sub": "<user-b-auth-uuid>"}';
SELECT count(*) FROM public.team_invitations;
-- Expected: only org B's pending invitations.

-- As service role (bypasses RLS):
RESET ROLE;
SELECT count(*) FROM public.team_invitations;
-- Expected: all invitations across all orgs.
```

If the second `SELECT` returns rows from org A, the RLS policy on `team_invitations` is wrong — fail the audit.

## Cleanup

After each manual run:
1. Delete the org B test tenant (admin → orgs → archive).
2. Delete any test users created in `auth.users` for org B.
3. Confirm `audit_events` shows the cleanup actions for traceability.

## Cadence

Run this playbook:
- **Before any commerce activation** (Stage 9.A onward — first paying customer).
- **After any new tenant-scoped table is added** (the static suite catches the obvious case; this catches the runtime-only failures).
- **After any change to `is_in_user_organization` or `is_internal_user`** SQL function bodies.
- **Quarterly** as a baseline security check.

Keep a one-line entry in `tmp/cross-org-isolation-runs.md` per manual run: date, runner, outcome.
