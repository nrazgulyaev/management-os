# SubscriptionOS — Architecture

**Stage**: 10.6.E.1 (architecture phase)
**Status**: Layout + workspace switcher entry + landing page shipped. 6 admin pages land in 10.6.E.2.

---

## TL;DR

SubscriptionOS is a **fifth workspace** alongside Mgmt OS / Dev OS / Owner Portal / Field App. It's the operator-facing surface for managing customer organizations, subscriptions, billing, and platform-admin tooling.

**The heavy lifting is already done**:
- Schema (orgSubscriptions FSM, subscriptionPlans, featureFlags, planFeatures, subscriptionLifecycleEvents) shipped in Stage 7.D
- Stripe webhooks + trial-status cron + trial-expiry-reminder cron exist
- Workspace switcher infrastructure (`<WorkspaceSwitcher>`) already supports product gating
- AES-256-GCM credential storage already exists for per-org encryption

**What 10.6.E adds**: the operator UI layer + impersonation tool + 0 new migrations.

---

## URL structure

**Locked**: `/subscriptions/*`

Decision rationale (CHECKPOINT 5 default):
- `/subscriptions` reads as operator-facing language ("manage customer subscriptions") — matches what the operator actually does in this workspace.
- `/platform-admin` reads as system-y / sysadmin language. Less inviting, less operator-friendly.
- `/system` was considered and rejected — already used by `/dashboard/system/*` (workspace health).

Per-page paths:
- `/subscriptions` — landing page (shipped 10.6.E.1)
- `/subscriptions/organizations` — customer org overview (10.6.E.2.1)
- `/subscriptions/[orgCode]` — per-org detail (10.6.E.2.2)
- `/subscriptions/revenue` — MRR / ARR / conversion / churn (10.6.E.2.3)
- `/subscriptions/usage` — per-org usage analytics (10.6.E.2.4)
- `/subscriptions/support` — customer support tools incl. impersonation (10.6.E.2.5)
- `/subscriptions/audit` — platform-admin audit log (10.6.E.2.6)
- `/subscriptions/billing` — Stripe Customer Portal links per-org (after 10.6.D.2.2 ships Stripe Connect)

---

## Permission model

**v1 (10.6.E.1)**: Gate purely on `getCurrentUserContext().isSuperAdmin`.

**v2 (10.6.E.2 may extend)**: Split into two roles:
- `platform_owner` — full read + write (extends super_admin)
- `customer_support` — read-mostly + impersonation, no destructive actions (cancellations, comp grants)

The split is a 2-row migration to the existing `roles` table (already shipped in Stage 5.J). Operator can defer the split to 10.6.E.2 launch time when the impersonation flow ships and the read/write distinction starts to matter.

**Demo-mode bypass**: Per the existing `getCurrentUserContext()` contract, demo mode (no DB) lets the user through. Matches Mgmt OS / Dev OS layout behavior. Live mode requires authentication AND super_admin role.

---

## Layout pattern

`src/app/(subscription-app)/layout.tsx` mirrors the **10.6.B.2-fix layout-resilience pattern**:

1. `try { await getCurrentUserContext(); ... }` — auth check
2. `if (isRedirectError(err)) throw err;` — preserve intentional redirects (login, no-product-access)
3. `console.error("[layout/subscription] auth check threw:", err); return <ServiceTemporarilyUnavailable area="dev" />;` — graceful degradation when the auth path fails

**Critical difference from Mgmt/Dev OS**: SubscriptionOS does NOT call `enforceProductAccess()`. It's a platform-admin workspace, not gated by the org's `productsEnabled`. An org without any products can still expose SubscriptionOS to its super_admin (because super_admin manages OTHER orgs' subscriptions, not their own product access).

---

## Workspace switcher integration

`src/components/shared/workspace-switcher.tsx` updated:

- New `"subscription"` workspace key
- New `requiresSuperAdmin?: boolean` filter on the Workspace interface
- New `isSuperAdmin?: boolean` prop on the `<WorkspaceSwitcher>` component (defaults to `false` so the platform-admin entry stays hidden from regular users by default)
- `visibleWorkspaces()` now filters by both `enabledProducts` AND `isSuperAdmin`
- New `"ink"` tone with `bg-ink text-ink-inverse` styling — distinguishes the platform-admin workspace visually from product workspaces

Callers must thread `isSuperAdmin={ctx.isSuperAdmin}` through to the switcher to surface the SubscriptionOS entry. Calls without the prop default to `false` and behave identically to pre-10.6.E.1 (no breaking change).

---

## Schema impact

**v1 (10.6.E.1 + most of E.2)**: 0 migrations.

Every admin page reads from existing tables:
- `organizations` (Stage 5.J)
- `orgSubscriptions` (Stage 7.D)
- `subscriptionPlans` (Stage 7.D)
- `subscriptionLifecycleEvents` (Stage 7.D)
- `usageMetrics` (Stage 7.E)
- `auditLog` (Stage 5.D)
- `orgAiAgentConfig` (Stage 10.5.B)

**v2 (10.6.E.2.5 if in-app tickets chosen)**: 1 migration adding a `support_tickets` table. Per CHECKPOINT 5 default, support tickets stay external (Plain / Linear / Intercom) for v1 — operator can switch later.

**v2 (10.6.E.2 if role split chosen)**: 2 row inserts into `roles` (`platform_owner`, `customer_support`). Lightweight — not a true migration.

If schema additions ship, follow the 10.6.B.1-fix protocol:
1. Write migration locally → PG18 dryrun
2. Halt for operator manual production apply
3. Verify schema state via SQL
4. Then ship the dependent UI

---

## Impersonation flow ("View as customer")

**Recommended for 10.6.E.2.5**: cookie-driven impersonation that overlays a banner.

1. Operator clicks "View as customer" on a per-org detail page
2. Server action sets a `__platform_impersonation` cookie with `{ asOrgId, byOperatorId, startedAt }` + a 1-hour TTL
3. Audit log entry logged: `actor=platform_admin, action=impersonate_start, target_org=X, by_operator=Y`
4. Middleware checks the cookie on every request to a tenant-gated route. If present, swaps the resolved org_id from "operator's org" → "asOrgId" but ONLY for read queries — every write throws "Impersonation read-only" error
5. Unmissable banner overlay rendered at top of page: "Viewing as Acme Corp · Read-only · End impersonation"
6. End impersonation: clear the cookie + audit log entry

**Security guarantees**:
- Reads are cookie-scoped; writes throw at the server-action layer (no possibility of accidental write-as-customer)
- Audit log entries are append-only, RLS-protected, exportable
- Cookie expires automatically; can't be silently extended

This is ~6h of work for 10.6.E.2.5 — manageable inside the 1-week 10.6.E.2 budget.

---

## Stripe Customer Portal integration

**Out of 10.6.E.1 scope**. Planned for 10.6.E.2 once 10.6.D.2.2 (Stripe Connect per-org UI) ships.

The integration is small (~1h):
1. Per-org "Manage billing" link on `/subscriptions/[orgCode]` detail page
2. Server action calls `stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: ... })`
3. Redirect operator to the returned portal URL
4. Stripe handles all the actual billing UX (update payment method, view invoices, change plan, cancel)

The lift is in 10.6.D.2.2 — getting Stripe Customer Portal configured in the Stripe dashboard. Once that's live, the SubscriptionOS-side integration is trivial.

---

## What 10.6.E.1 ships (this commit)

- `src/app/(subscription-app)/layout.tsx` — gated layout
- `src/app/(subscription-app)/subscriptions/page.tsx` — landing page with planned-pages roadmap
- `src/components/shared/workspace-switcher.tsx` — 5th workspace + super_admin gate
- `docs/subscription-os-architecture.md` — this doc

What 10.6.E.1 does NOT ship (all in 10.6.E.2):
- Customer org overview list
- Per-org detail
- Revenue / usage dashboards
- Impersonation flow
- Audit log
- Stripe Customer Portal links

---

## Acceptance gate (10.6.E.1)

- ✅ Layout exists + super_admin gate works
- ✅ Workspace switcher renders SubscriptionOS for super_admin users (and hides it for everyone else)
- ✅ `/subscriptions` landing page renders with planned-pages roadmap
- ✅ Architecture doc shipped
- ⛔ Operator visits `/subscriptions` as super_admin in dev — confirms the workspace switcher entry shows + landing renders
- ⛔ Operator confirms a non-super-admin user gets redirected to `/no-product-access?reason=subscription-os-requires-super-admin`

Reply **"go 10.6.E.2"** when ready to launch the 6 admin pages.

---

## Open methodology questions (defer-able)

1. **Should the WorkspaceSwitcher consumer auto-thread `isSuperAdmin`?** Currently every caller has to pass it explicitly. Could be a default-from-context auto-resolution (the switcher reads `getCurrentUserContext()` itself). Risk: server-component overhead on every render. Recommend explicit threading for v1.
2. **Should SubscriptionOS have its own dedicated subdomain (e.g. admin.arconique.com)?** Better security posture (no chance of accidentally exposing platform-admin to customer subdomains). Trade-off: more cookie / auth wrangling. Defer to Stage 11+.
3. **Should impersonation log to a dedicated `platform_admin_actions` table or piggyback on the existing `audit_log`?** Existing `audit_log` is fine for v1 — `actor_kind = 'platform_admin'` filter scopes it. Dedicated table only needed if support volume grows.
