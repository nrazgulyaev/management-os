# Stage 10.6.A CHECKPOINT 4 — SubscriptionOS gap analysis

**Date**: 2026-05-13
**Status**: Foundation tables already exist (Stage 7.D shipped Stripe-bridge subscription FSM). Only the **operator-facing workspace + customer support tooling** is missing.

---

## TL;DR for the operator

**Good news**: `orgSubscriptions`, `subscriptionPlans`, `featureFlags`, `planFeatures`, `subscriptionLifecycleEvents` tables + Stripe webhook handler + trial-status cron + workspace switcher infrastructure **already exist**. Stage 7.D + 10.H + 10.I shipped them.

**What's missing**: A `/subscriptions/*` workspace (or `/platform-admin/*`) + 6 admin pages on top of the existing data + 1 net-new feature ("view as customer" impersonation) + 1 net-new integration (Stripe Customer Portal link per-org).

**Schema additions required**: 0-1 migrations only (everything operator-facing reads from existing tables; one OPTIONAL migration adds a `support_tickets` table if customer support workflow goes inside the app vs an external tool).

**Effort**: 6-sub-phase MVP fits in ~1 week (matching the master plan's 10.6.E.2 estimate). The architecture phase 10.6.E.1 is mostly "decide the URL prefix + add 4th workspace to the switcher + write impersonation middleware" — small.

---

## 1. What already exists (don't rebuild)

### Schema (Stage 7.D — `src/lib/db/schema/subscriptions.ts`)

| Table | Purpose | Rows |
|---|---|---|
| `subscriptionPlans` | Plan catalog (starter / pro / enterprise) with monthly + annual pricing, Stripe product/price IDs, trial period, grace/archive/purge defaults | Configurable |
| `orgSubscriptions` | Per-org subscription state — status FSM (trial → active → grace → cancelled → archived → purged → reactivated), period boundaries, Stripe linkage, autoRenew flag | 1 per org |
| `featureFlags` | Feature catalog (boolean OR numeric-quota gates) | Configurable |
| `planFeatures` | Per-plan feature/quota matrix | Configurable |
| `subscriptionLifecycleEvents` | Append-only audit trail of state transitions | Append-only |

Plus `organizations` (Stage 5.J) carries the simpler `subscriptionTier`, `trialStatus` FSM, `productsEnabled` array, and resource limits (`maxUsers`, `maxProjects`, `maxAiAgentInvocationsPerMonth`, `maxStorageGb`).

### Stripe integration (Stage 7.D)

- Webhook endpoint: `/api/webhooks/billing/stripe` — handles `customer.subscription.{created,updated,deleted,trial_will_end}`, `invoice.{paid,payment_failed,payment_action_required}`. Idempotent via `payment_webhook_events`.
- Bridge: `stripe-subscription-bridge.ts` maps webhook events → state transitions on `orgSubscriptions`.
- Cron jobs: `/api/cron/trial-status` (daily, expires trials) + `/api/cron/trial-expiry-reminder` (daily, emails owners 3 days before trial end).

### Workspace switcher (Stage 10.H — `workspace-switcher.tsx`)

Currently 4 workspaces: management, development, owner, field. **Adding a 5th ("subscription") is a single-array entry change** with optional product gate set to `null` (platform-admin doesn't gate by per-org product).

### Multi-tenancy walls (Stage 5.J + 5.J.2 + 10.6.B.1-fix)

Migration 0072 added `organization_id NOT NULL` to most tenant tables + indexes. RLS is database-enforced. Subdomain → org_id resolution happens in server components, not edge.

---

## 2. What's missing — gap by gap

### 2.1 No `/subscriptions` (or `/platform-admin`) workspace

**Existing platform admin surface is split + dev-os-coupled**:
- `/dashboard/system/{health,deployment,storage}` — read-only health
- `/development-os/platform/{organizations,branding,api-docs,usage}` — tenant registry, but lives **inside Development OS layout** (gated by product='dev', not by super_admin role)

**Recommendation**: Create `/subscriptions/*` (or `/platform-admin/*`) as a fifth workspace under a new layout `(subscription-app)`. Move/alias `/development-os/platform/organizations` → `/subscriptions/organizations`. Gate by super_admin role at the layout level (same try/catch + isRedirectError pattern as 10.6.B.2-fix).

**URL choice**: Recommend `/subscriptions` (operator-facing — operator manages customer subscriptions). `/platform-admin` is also fine but more system-y. Operator decides at 10.6.E.1 architecture lock-in.

### 2.2 No customer-support tools (impersonation, ticket queue)

- **Audit log exists** (`/dashboard/audit`) but read-only, no search/filter, no manual annotation.
- **No "view as customer"** impersonation flow. Operator-flagged need: when a customer reports an issue, operator wants to see what they see without asking them to screenshare.
- **No support ticket integration** in-app. Currently external (email / WhatsApp).

**Recommendation**: 
- Build read-only impersonation middleware that sets a "viewing-as" header with the target org_id, gates ALL writes (audit log entry "operator X impersonated org Y at time Z"), and overlays an unmissable banner. ~4h.
- Defer in-app ticket queue to a later phase. Keep external for now; just add a "Open support ticket" link per org that emails operator (~1h).

### 2.3 No revenue dashboard

Tables have all the data (`orgSubscriptions.status` + `subscriptionPlans.monthlyPriceMinor` + lifecycle events for churn). But no view aggregates MRR / ARR / trial→paid conversion / churn. **Build new — ~4h** to write a query that joins subs to plans + groups by status.

### 2.4 No customer-org overview list

`/development-os/platform/organizations` exists but is read-only and lives inside the wrong workspace. Doesn't show subscription status, trial countdown, MRR contribution, last login, support ticket count. **Reskin and move — ~6h**.

### 2.5 Schema gaps (vs. real SaaS depth)

Per the agent's audit, missing:
- **No invoice table** (Stripe invoices flow through but aren't mirrored locally — fine for now, but a "send invoice copy" feature would need them).
- **No dunning / retry orchestration** (Stripe handles retries; we just need a queue view of in-grace orgs).
- **No usage-based billing meter** (we track usage in `usageMetrics` but don't bill on it).
- **No seat provisioning ledger** (`maxUsers` enforced at insert time but no ledger).

**Recommendation**: Defer ALL of these to post-10.6.E. The MVP runs on existing tables. Real usage-based billing is a Stage 11+ initiative.

---

## 3. 6-sub-phase MVP scope (matches master plan's 10.6.E.2)

| Sub-phase | Page | Reads from | Writes to | Effort |
|---|---|---|---|---|
| **E.2.1** | `/subscriptions` overview — list all customer orgs, filter by status (trial/paid/cancelled), search by name/email | `organizations` + `orgSubscriptions` join | None | ~6h |
| **E.2.2** | `/subscriptions/[orgCode]` per-org detail — status, trial countdown, MRR, recent activity, action buttons (extend trial / downgrade / cancel / comp) | Same join + `subscriptionLifecycleEvents` for activity feed | `orgSubscriptions` (status transitions go through existing FSM helpers, not raw updates) + lifecycle event append | ~8h |
| **E.2.3** | `/subscriptions/revenue` — MRR + ARR + customer count by tier + trial→paid conversion rate + churn rate | All four subscription tables | None (read-only) | ~4h |
| **E.2.4** | `/subscriptions/usage` — per-org AI usage, storage, user count, aggregate metrics | `usageMetrics` + `orgAiAgentConfig` | None | ~4h |
| **E.2.5** | "View as customer" impersonation tool | Sets context cookie | Writes audit log entry per impersonation start/end | ~6h |
| **E.2.6** | `/subscriptions/audit` platform-admin audit log — every platform-admin action filterable + exportable | New thin index over existing audit log filtered by `actor_kind = 'platform_admin'` | None | ~3h |

**Total**: ~31h fits in 1 week. Matches master plan's 10.6.E.2 estimate.

### 10.6.E.1 architecture phase scope (~3-4 days per master plan)

| Task | Effort |
|---|---|
| Lock URL structure (`/subscriptions` vs `/platform-admin`) | 30 min decision |
| Add 5th workspace to switcher | 1h |
| New `(subscription-app)` layout + super_admin gate | 2h |
| Permission model — `super_admin` extension OR new `platform_owner` + `customer_support` roles | 2h (decision + DB role definitions) |
| Optional migration: `support_tickets` table (only if in-app ticket queue scoped) | 2h or skip |
| `docs/subscription-os-architecture.md` | 2h |

**Total**: ~12-14h fits in 3-4 days. Matches master plan estimate. The "optional migration" is the only schema risk — if operator says "external Linear/Intercom for tickets is fine," 10.6.E.1 ships zero migrations.

---

## 4. Migration risk assessment

**Likely**: 0 migrations. Everything reads from existing tables.
**Possible**: 1 migration (`support_tickets` table if in-app ticket workflow chosen).
**Not recommended yet**: invoice mirror table, usage-meter table, seat-ledger table — defer to Stage 11+.

If the support_tickets migration ships, follow the 10.6.B.1-fix protocol:
1. Write migration locally → PG18 dryrun
2. Halt for operator manual production apply
3. Verify schema state via SQL
4. Then ship the support tickets UI

---

## 5. Open questions for operator (resolve in 10.6.E.1)

1. **URL prefix**: `/subscriptions` (recommended) or `/platform-admin`?
2. **Permission model**: extend existing `super_admin` role, or split into `platform_owner` (full access) + `customer_support` (read-mostly + impersonation)?
3. **Support tickets**: in-app queue (1 migration + 1 sub-phase of UI) or external tool (Linear / Intercom / Plain)? External is simpler; in-app is more operator-friendly long-term.
4. **Stripe Customer Portal**: per-org "Manage billing" link that deep-links to Stripe-hosted portal? (~1h to wire if Stripe Customer Portal is configured in Stripe dashboard.)
5. **Workspace name in switcher**: "Subscription OS" or "Platform Admin"?

---

**Status**: Architecture is mostly already shipped (Stage 7.D + 10.H + 10.I). What remains is: a workspace, 6 pages, an impersonation flow, and 5 small operator decisions. 10.6.E is one of the **smallest** phases in the 10.6.B-F roadmap because the heavy infrastructure already exists.
