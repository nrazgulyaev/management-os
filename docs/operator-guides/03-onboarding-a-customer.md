# Onboarding a customer

How a second villa-management company self-signs-up on Arconique and
becomes a paying tenant. Same flow you walked yourself in
[01-onboarding-your-company.md](./01-onboarding-your-company.md) —
this guide focuses on what differs when they're a *customer*, not
*you*.

## Customer path (zero friction)

1. They visit `/signup` on your production URL (`/signup?product=mgmt`,
   `?product=dev`, or the default "both").
2. They pick their workspace name + slug + plan tier (trial / starter /
   pro / enterprise).
3. Their auth user + org + super_admin role + trial subscription are
   created atomically.
4. They land at `/dashboard` for their new org — totally empty,
   isolated from every other tenant.

No human-in-the-loop on your side. The flow is fully self-serve.

## What's isolated today (multi-tenant safe)

After today's STAB-4 fix, these surfaces correctly scope to the
customer's org:

- ✅ Org creation + the customer's super_admin role grant
- ✅ Team invitations (the customer's admins invite into their own org)
- ✅ Cost categories CRUD (post-HF-5)
- ✅ Bank accounts CRUD (post-HF-5)
- ✅ Audit events (org-scoped queries throughout the codebase)
- ✅ Subscription billing (Stripe customer per org)
- ✅ AI agent **configuration** rows (per-org enablement)

## What's NOT isolated yet (architectural debt)

A second tenant going live today will hit the **HF-5 + STAB-4
multi-tenancy debt**: 163 server-action sites that don't include
`organization_id` in their writes + 36 server-side org-resolution
sites that hardcode `ARCONIQUE_DEFAULT`. Until that's drained, expect:

- **Read leak**: Some settings pages will show the operator's data to
  the customer instead of the customer's own. Example: AI agent
  enablement list — the customer would see the operator's enabled
  agents, not their own.
- **Write leak**: Some "Add X" actions will write the new row with
  the operator's `organization_id`, not the customer's. Result: the
  customer's submission appears in the operator's tenant.

Specific surfaces affected: see the full list in
`docs/audits/2026-05-16-sprint-stab-4-onboarding-multitenancy.md`.

**Recommended posture**: do not onboard a paying second customer
until the architectural sprint drains the HF-5 baseline. The HF-5
closure doc (`docs/audits/2026-05-15-hotfix-hf-5-multitenant-audit.md`)
has the three options: hand-fix all 165, ship Drizzle middleware,
or enable PostgreSQL row-level security.

## Operator's role per customer

Today (single-tenant operator-as-admin):

| Task | Where | Who does it |
|---|---|---|
| Onboard the customer | Customer self-serves `/signup` | Customer |
| Activate paid subscription | `/dashboard/billing/upgrade` after trial ends | Customer (Stripe-driven) |
| Provision the customer's villas / vendors / categories | Inside the customer's cabinet | Customer's admins |
| Resolve issues / impersonate | Operator login → `/platform/[orgCode]` | **You** (super_admin via platform-app group) |
| Refund / cancel | Operator → Stripe dashboard | **You** |

The platform-app group at `/platform/*` is your god-mode view across
all tenants. It's auth-gated to super-admin-only and uses different
queries that explicitly take an `orgCode` param — that's safe today.

## Customer's billing path

1. Trial starts on signup (14 days).
2. Trial-expired customers see a soft paywall — workspace becomes
   read-only.
3. They visit `/dashboard/billing/upgrade` → pick a plan → enter
   payment via Stripe Checkout.
4. Stripe webhook updates `org_subscriptions.status = "active"`.
5. The customer's tenant unlocks.

Webhook handler at `/api/webhooks/billing/*`. Stripe customer ID lives
on `org_subscriptions.stripe_customer_id`.

## Switching between your own tenant and a customer's

**Today**: not supported in the UI. One user account = one tenant.
If you want to dogfood both "Arconique" (your own villas) and "Other
Co Demo" (a customer), you need two separate email accounts and to
sign in/out to switch.

**Workaround**: use a browser profile per tenant.

**Backlog**: an org-switcher UI for users with super_admin role
across multiple orgs. Flagged for the architectural sprint that
drains the multi-tenancy debt — both projects benefit from the same
session-level org context.

## Quick "second tenant" smoke test (when ready)

Once the architectural sprint lands, validate isolation by:

1. As operator, `/signup` a synthetic "Test Tenant" workspace with a
   different email.
2. Sign in to the test tenant.
3. Add a bank account named `TEST_TENANT_ONLY`.
4. Sign out, sign back in as your normal operator account.
5. Visit `/development-os/finance/bank-accounts`.
6. **`TEST_TENANT_ONLY` must NOT appear.** If it does, that's a
   regression — file an issue and roll the deploy back.
7. Repeat for: cost categories, leads, reservations, transactions,
   invoices, projects, AI agent configs.
