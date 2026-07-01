# Signup→super_admin escalation — residual closure + role-cleanup decision (2026-06-25)

Follow-up to PR #302 (`docs/MONEYFLOW-SURFACES-AUDIT.md` finding #1). Founder
confirmed public `/signup` **stays open** (anyone self-registers, 14-day trial),
so the global-`super_admin`-on-signup escalation must be fully contained.

## Context

`signup/actions.ts` and `api/onboarding/start/route.ts` mint a GLOBAL
`super_admin` (`user_roles`, scope NULL) for every new org admin. #302 gated the
two shared platform helpers (`requireSuperAdmin`/`isSuperAdminContext`) behind the
`PLATFORM_ADMIN_EMAILS` allowlist, which closed the **Platform OS** + the
**impersonation-start** actions (they call the helper). But a tenant-admin
`super_admin` still had cross-tenant power through code that read the **raw
`ctx.isSuperAdmin` field** directly (the field is unchanged — by design, so
tenant admins keep their OWN-org cabinet bypass).

## What this PR closes — raw `ctx.isSuperAdmin` on platform-only surfaces

All routed through the allowlist-gated `isSuperAdminContext()`:

| Surface | Was | Risk |
|---|---|---|
| `channels/actions.ts` ×3 | raw field | mutate the SHARED booking-channel catalog (no org col) every tenant uses |
| `guest-services/actions.ts` ×1 | raw field | mutate the SHARED guest-service category catalog |
| `maintenance-intelligence/actions.ts` ×2 | raw field | mutate the SHARED maintenance-template catalog |
| `lib/.../usage/usage-queries.ts` `listUsageMetricsAcrossOrgs` | raw field | read EVERY org's usage volumes (cross-tenant read) |
| `owner-portal/owner-context.ts` | raw field | resolve a cross-tenant owner impersonation context |
| `investor-portal/investor-context.ts` | raw field | resolve a cross-tenant investor impersonation context |
| 5 UI button-gates (categories ×2, templates, owners, investors) | raw field | cosmetic — Manage/Impersonate affordance shown to tenant admins |

After this, a tenant-admin `super_admin` has **no remaining cross-tenant
capability**: org-scoped data is already protected by `requireOrgId()` +
`eq(organizationId)` at every action (the `hasPermission` short-circuit lets them
PASS the permission check but the query still can't cross orgs); the only
non-org-scoped surfaces were the shared catalogs + cross-org reads above, now
platform-operator-only.

Remaining legitimate raw `ctx.isSuperAdmin` reads are all IN-ORG and correct:
cabinet all-access (`keystone/access.ts`), product visibility
(`products-access*`), the roles-matrix editor (org-scoped overrides), the team
page (also gated on `director`), agent test-mode.

## Decision — DEFER the literal role swap (signup `super_admin`→`director`)

The audit suggested swapping the granted role to `director`. Investigated and
**rejected as a rushed change** on the live prod DB:

- `director` is in only a subset of the 74-entry cabinet/permission matrix
  (it IS in `INTERNAL_ROLES`, so it covers the `INTERNAL_ROLES` cabinets, but
  several explicit `.read`/`.write` lists omit it), so a fresh signup could land
  on a partially-empty dashboard.
- `users.write` and `roles.assign` are `super_admin`-ONLY → a `director` tenant
  admin could not invite teammates or assign their roles (core onboarding). To
  switch we'd first have to add `director` to those (safe — the role-assign
  action is org-scoped and `ASSIGNABLE_INTERNAL_ROLES` excludes `super_admin`,
  so no escalation) plus audit full matrix coverage and add a new-tenant smoke
  test.
- With the cross-tenant powers now closed, the swap is **semantic /
  defence-in-depth only**, not a live exposure — so it doesn't justify the
  onboarding-regression risk without a test harness.

**Recommended as a dedicated, test-backed follow-up**, not a marathon edit.

## Still deferred (unchanged)

- Email verification on signup — **blocked**: no email infra (`RESEND_API_KEY`
  unset, `sendEmail` returns an error). Forcing it would lock out every signup.
  Unblock by configuring Resend (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`) or
  Supabase project SMTP, then flip `email_confirm` to a real verify flow.
- Signup rate-limit — needs its own persisted throttle (serverless = no
  in-memory state; the login-throttle table is login-semantic). Small follow-up.
- signup→org provisioning rollback transaction (orphan org on partial failure).
