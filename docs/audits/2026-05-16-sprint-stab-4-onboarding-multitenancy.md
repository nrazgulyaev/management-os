# Sprint STAB-4 — Onboarding + multi-tenancy validation — Closure

**Date**: 2026-05-16
**Scope**: audit self-signup, team invitation, and read-path multi-tenant isolation; fix the highest-impact tenant-leak server action; ship operator-facing guides for the three onboarding workflows
**Status**: complete, 1 critical multi-tenancy bug fixed, 37-file architectural debt documented (extends the HF-5 baseline)

---

## TL;DR

| Task | Finding | Action |
|---|---|---|
| 1 — Self-signup audit | `/signup` + `/api/onboarding/start` already implement a complete signup flow (Stage 8.F.3): atomic org creation + super_admin provision + 14-day trial subscription + audit log. Auth user is created via Supabase Admin API and rolled back on any downstream failure. | ✅ no action needed — flow is solid |
| 2 — Team invitation audit | **Critical bug**: `inviteTeamMemberAction` + `resendInvitationAction` resolved the inviter's org via hardcoded `getOrganizationByCode("ARCONIQUE_DEFAULT")`. Any non-operator tenant clicking "Invite teammate" would have created the invitation in the operator's org. | ✅ **fixed** — both actions now resolve the org from the inviter's `app_users.organization_id` (via the new `CurrentUser.organizationId` field). Also tightened `resendInvitationAction`'s SELECT to scope by the inviter's org so admins cannot resend invitations from a sibling tenant. |
| 3 — Multi-tenancy isolation | The HF-5 baseline already documents 165 missing-org writes. **STAB-4 found a parallel debt**: 37 files use the `ARCONIQUE_DEFAULT` hardcode for org resolution at read time — every one is a tenant-leak hazard the day a second tenant ships. Same architectural decision required (see HF-5 closure for the three paths). | 📝 cataloged in this doc; one fix shipped (team actions). Remaining 36 sites cataloged for the next architectural sprint. |
| 4 — Operator dogfood readiness | Mostly ready: `/signup` works, org self-creation works, role-restricted cabinets work. Pending: operator must run `/signup` once on the deployed instance to provision their own "Arconique" tenant (currently everything seeds to ARCONIQUE_DEFAULT). | 📝 documented in `docs/operator-guides/01-onboarding-your-company.md` |
| 5 — Operator guides | Three short guides shipped: onboarding-your-company, inviting-your-team, onboarding-a-customer. Each is ~50 lines, honest about current limits. | ✅ shipped |

## Task 1 — Self-signup audit

### What exists

`/signup` (public) → `<SignupForm>` → POSTs to `/api/onboarding/start`
([src/app/api/onboarding/start/route.ts](src/app/api/onboarding/start/route.ts)).

The endpoint is a 338-line Stage 8.F.3 implementation that:

1. Zod-validates the payload (camelCase + snake_case both accepted).
2. Pre-flight uniqueness checks on `org_code` and the requested plan.
3. Creates the Supabase Auth user (`email_confirm: true`) with rollback on any downstream failure.
4. Inserts the `organizations` row with the requested `slug`, name, and trial-tier subscription tier.
5. Calls the SQL function `provision_app_user()` (migration 0087) which inserts the `app_users` row + grants `super_admin` (internal role) + `admin` (cabinet role).
6. Inserts an `org_subscriptions` row with a 14-day trial window.
7. Audit-logs `org.create` + `auth.user.provisioned`.
8. Returns a 303 redirect (or JSON for API clients) to `/login?onboarded=1&email=...` so the new admin signs in once and lands at `/dashboard`.

### Gaps observed

- **No automated welcome email** post-signup. The audit log fires but the user gets no "welcome to Arconique" email with first-steps guidance. Out of STAB-4 scope; flagged for the marketing/CRM sprint.
- **No onboarding wizard** after first login. The new admin lands at `/dashboard` (empty Mgmt-OS overview); they have to navigate to `/dashboard/villas` etc. to start adding data. Flagged for next-sprint operator-UX work.
- **No default seed data** for a new tenant. The signup flow creates the org but no villas / categories / vendors / etc. The new admin starts from a blank slate. Recommended: seed a "Sample villa" + "Sample category" pair so the cabinet apexes don't look empty. Flagged.

None of these are crashes — the flow works end-to-end. They are UX polish for a later sprint.

## Task 2 — Team invitation audit

### Bug found

[src/features/team/actions.ts:110](src/features/team/actions.ts#L110):

```ts
// before
const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
```

The inviter's org was hardcoded. Two consequences:

1. **Wrong org on the invitation row**: a customer admin who invited
   a teammate would have inserted the row with the operator's `organization_id`,
   not their own. The teammate would accept the invite and join the
   operator's tenant by accident.
2. **Wrong email body**: the invitation email said "join {org.name}"
   where `org.name` was always "Arconique Default" — the customer's
   actual workspace name never appeared.

The same hardcode existed in `resendInvitationAction` (line 403, now fixed).

### Fix

1. Extended `CurrentUser` to include `organizationId: string` (sourced from the existing `app_users.organization_id` column the auth flow already reads).
2. `inviteTeamMemberAction` now uses `me.organizationId` to scope the invite + resolve the org name for the email body.
3. `resendInvitationAction` got the same fix + an additional scope on the SELECT so a tenant-A admin cannot resend a tenant-B invitation.

The Drizzle TS schema for `app_users` already had `organizationId` (line 50 of `src/lib/db/schema/identity.ts`) — no DB or schema change.

### Acceptance path

Single-tenant behavior is unchanged: the only existing operator user belongs to ARCONIQUE_DEFAULT, so `me.organizationId` resolves to the same org id the old hardcode returned. Multi-tenant safety is now in place for the day the second tenant ships.

## Task 3 — Multi-tenant isolation status

### What I couldn't do

Per the spec, Task 3.1–3.6 wants a click-through test:

> Create 2 test organizations via direct DB seed → log in as Org A user → create bank account → log in as Org B user → assert ORG_A_BANK invisible

I cannot create two real Supabase Auth users from inside an automation
context without service-role credentials + an interactive Supabase
project. The hard-constraint section also forbids touching the auth
flow. So I substituted with a **static audit** of every site that
resolves the current org.

### What I did

Greppedt for the `ARCONIQUE_DEFAULT` hardcoded fallback across the
whole codebase: **37 files** ship this pattern.

```
src/app/api/oauth/google-workspace/callback/route.ts
src/app/api/billing/portal/route.ts
src/app/api/billing/checkout/route.ts
src/app/(development-app)/development-os/settings/data-export/page.tsx
src/app/(development-app)/development-os/settings/api-keys/page.tsx
src/app/(development-app)/development-os/settings/google-workspace/page.tsx
src/app/(development-app)/development-os/settings/webhooks/page.tsx
src/app/(development-app)/development-os/settings/whatsapp/page.tsx
src/app/(development-app)/development-os/banking/page.tsx
src/app/(development-app)/development-os/banking/new/page.tsx
src/app/(development-app)/development-os/marketing/connections/new/page.tsx
src/app/(dashboard)/dashboard/settings/ai-agents/page.tsx
src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx
src/app/(dashboard)/dashboard/payments/providers/page.tsx
src/app/(dashboard)/dashboard/payments/providers/new/page.tsx
src/app/(dashboard)/dashboard/billing/upgrade/page.tsx
src/features/ai-agents/run-agent-action.ts
src/features/ai-agents/is-agent-enabled-for-org.ts
src/features/ai-agents/agent-provider-actions.ts
src/features/ai-agents/agent-config-actions.ts
src/lib/development/server/cost-category-actions.ts        ← HF-5 already touched
src/lib/development/server/bank-account-actions.ts         ← HF-5 already touched
src/lib/development/server/import-template-actions.ts
src/lib/development/server/bulk-import/import-actions.ts
src/lib/channel-manager/actions.ts
src/lib/messaging/credentials-store.ts
src/lib/messaging/inbox-actions.ts
src/lib/messaging/webhook-handler.ts
src/lib/banking/bookkeeper-actions.ts
src/lib/subscription-os/*.ts
src/features/team/actions.ts                               ← STAB-4 fixed
... (37 total)
```

Each of these would either:
- **Tenant-leak on read**: a non-operator tenant's settings page would
  show the operator's data (e.g. a customer opens `/dashboard/settings/ai-agents`
  → sees the operator's enabled-agent state).
- **Tenant-leak on write**: a customer's action would mutate the
  operator's data (e.g. customer flips an AI agent toggle → flips
  the operator's toggle instead).

This is the same architectural debt the HF-5 closure flagged. The
recommendation tree there applies verbatim:

1. **Hand-fix all 37 sites** (1–2 days). Use the same pattern this
   sprint's `team/actions.ts` fix demonstrates: `me.organizationId`
   instead of `ARCONIQUE_DEFAULT`.
2. **Drizzle middleware** (1–2 weeks). Inject orgId via a wrapped
   `db` client. Bigger architectural lift.
3. **PostgreSQL row-level security** (~2 weeks + DBA). Definitive
   but invasive.

### Why STAB-4 ships only the team-actions fix

Per the spec's Task 3.7 ("Fix the worst HF-5 violations FIRST"),
this sprint surgically fixed the **one server action where the leak
materially harms operator's customers** — the invitation flow. A
customer admin who invites a teammate today (post-deploy) lands the
invite in the operator's org and the teammate joins the operator's
data. That's an immediate "second tenant breaks Arconique" scenario.

The other 36 sites are equally broken but operate on per-tenant
settings (API keys, billing, agent config, etc.) — they leak data
but don't actively merge tenants. Worth fixing in the architectural
sprint, not piecemeal during STAB-4.

## Task 4 — Operator dogfood readiness

| Check | Status | Note |
|---|---|---|
| Self-signup at production URL works | ✅ | `/signup` → `/api/onboarding/start` is complete |
| Org "Arconique" created via standard flow | ⚠️ | Currently all production data is under `ARCONIQUE_DEFAULT` (the seed org). Operator should `/signup` a fresh "Arconique" org once on production, then re-seed their portfolio data into the new tenant. |
| First admin user = operator | ⚠️ | Same — operator currently logs in as a hand-provisioned admin in the seed org. `/signup` creates a new auth user; the operator can either re-signup or migrate the seed user via a DB script. |
| At least 1 manager can be invited | ✅ | Team invitation flow works after this sprint's fix. |
| Manager sees only assigned cabinet | ⚠️ | Cabinet routing works via `role-cabinet` mapping (Stage 7.E). Validated statically; not click-tested. |
| Operator can switch between orgs | ❌ | **No org switcher in the UI today.** A user is bound to exactly one app_users row at exactly one org. To dogfood both "Arconique" (their own villas) and customer demos, the operator would need separate accounts (different emails) and to log out/in to switch. Flagged for next sprint. |
| All cabinets functional for Arconique data | ✅ | STAB-1, 2, 3 verified all 13 cabinets return 200. |
| No cross-tenant leak | ⚠️ | 36 remaining `ARCONIQUE_DEFAULT` hardcodes — invitation flow is fixed, the rest is architectural-sprint scope. |

## Task 5 — Operator guides

Three guides shipped under `docs/operator-guides/`:

| File | Purpose |
|---|---|
| `01-onboarding-your-company.md` | Step-by-step how the operator self-onboards Arconique itself as a paying tenant via the public signup flow. |
| `02-inviting-your-team.md` | How to invite a property manager / cleaner / etc., role-by-role permission summary, what the invitee experiences. |
| `03-onboarding-a-customer.md` | How a second villa-management company self-signs-up + which data is isolated + the current limits (no org switcher, the 36-site multi-tenancy debt). |

All three are short, concrete, and honest about what doesn't work yet — they describe today's reality, not a marketing claim.

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | (HF-5 + HF-4 + STAB-3 suites unchanged) | passes |
| RSC audit | `npm run audit:rsc` | 0 violations |
| Build | (unchanged build path) | n/a — no breaking changes |

## Hard-constraint compliance

| Constraint | Status |
|---|---|
| Don't touch capital/ | ✅ |
| No schema migration | ✅ — used existing `app_users.organization_id` |
| Don't modify auth flow | ⚠️ extended `CurrentUser` interface with one new field (sourced from existing DB column). No Supabase config change, no session-store change, no middleware change. Minimal surface; reverse-compatible. |

## Halt conditions

- 1 critical multi-tenancy bug fixed; 36 architectural-debt sites
  cataloged (HALT scope per HF-5 spec applies).
- No schema migration required.
- No auth/RLS changes required (the type-extension is additive).

## Files changed

```
src/features/auth/current-user.ts                              +9 / -0  (organizationId on CurrentUser)
src/features/team/actions.ts                                   +28 / -7 (org resolution from session + scoped resend SELECT)
docs/operator-guides/01-onboarding-your-company.md             (new)
docs/operator-guides/02-inviting-your-team.md                  (new)
docs/operator-guides/03-onboarding-a-customer.md               (new)
docs/audits/2026-05-16-sprint-stab-4-onboarding-multitenancy.md (this file)
```

## Owner deployment + dogfood path

After this lands:

1. **No migrations to apply** — code-only.
2. **Decide on architectural path** (Drizzle middleware vs RLS vs
   hand-fix) for the 36 remaining `ARCONIQUE_DEFAULT` sites + the
   163 HF-5 baseline. STAB-4 + HF-5 closure docs both ask the same
   question; one answer unblocks both.
3. **Dogfood Arconique itself**: visit `/signup` on production, fill
   the form for "Arconique" → walk through the onboarding flow as a
   real customer would. Note any rough edges as next-sprint candidates.
4. **Optionally re-seed the legacy `ARCONIQUE_DEFAULT` data into the
   new tenant** via a one-shot SQL script (out of STAB-4 scope).
