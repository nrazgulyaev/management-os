# Pricing model comparison — three sources of truth (read-only audit)

**Date:** 2026-05-13
**Author:** assistant, no file edits

The repo currently carries **three distinct pricing models** — none of
them aligned with each other. This doc surfaces all three side by
side and recommends the cheapest path to a single source of truth
for Sprint 3b (Stripe wiring sprint).

---

## TL;DR

| Source | Where | Tiers | Pricing dimension | Status |
|---|---|---|---|---|
| **DB seed** | `drizzle/0085…` | 6 plans (Internal, Trial, Basic, Standard, Pro, Enterprise) | **One plan covers both products** ($99 / $299 / $599) | shipped to schema + seeded; FSM live |
| **Marketing config** | `src/lib/billing/pricing.ts` (Stage 10.I.4) | 3 tiers per product (Starter / Pro / Enterprise) | **Separate plans per product** ($99/$299 mgmt vs $199/$499 dev) | drives `/pricing/management-os`, `/pricing/development-os` |
| **Sprint 3a tiers** | `src/lib/marketing/pricing-tiers.ts` | 4 tiers × 3 plans (Mgmt-only / Dev-only / **Bundle**) | **Three plan dimensions, four tiers each** ($79–$1,199) | drives the new top-level `/pricing` |

**Stripe is not wired.** No `STRIPE_*` keys in `.env.example`. No
`stripe.products.create` or `stripe.prices.create` calls anywhere. No
hardcoded `price_xxx` IDs. The schema reserves `stripe_product_id`,
`stripe_monthly_price_id`, `stripe_annual_price_id` columns on
`subscription_plans` but every existing row has them NULL. The
checkout endpoint (`src/app/api/billing/checkout/route.ts`) reads
`process.env.STRIPE_SECRET_KEY` and gracefully 503s with
`stripe_not_configured` when absent. The plan-upgrade page is fully
rendered + waiting for keys.

---

## Source 1 — DB seed (`drizzle/0085_development_os_stage_7_b_subscription_plans.sql`)

The plans table actually seeded into the database. **Single-dimension** —
one plan tier governs both products simultaneously; villa/project
caps are LIMIT flags on the same plan.

| plan_code | display_name | monthly_price (USD) | annual_price (USD) | trial days | is_public | Villa cap | Project cap | User seats | AI $/mo cap | Cabinets enabled | Integrations | AI agents |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `internal` | Internal — Arconique | $0 | $0 | 0 | **false** | unlimited | unlimited | unlimited | $50,000 | all 9 | (none listed) | full + dedicated |
| `trial` | Trial | $0 | $0 | **14** | true | 1 | 1 | 2 | — | owner | — | — |
| `basic` | Basic | **$99** | $990 | 0 | true | **3** | 1 | 5 | — | owner + sales | Booking.com | — |
| `standard` | Standard | **$299** | $2,990 | 0 | true | **10** | **3** | 15 | $500 | owner + cfo + pm + marketing + sales (5) | Booking.com + Airbnb + Stripe + Google Workspace | Tier 1+2 (`ai.agents_basic`) |
| `pro` | Pro | **$599** | $5,990 | 0 | true | **25** | **10** | 50 | $2,500 | all 9 | + Meta Ads + Google Ads (6) | Full (`ai.agents_full`) + investor portal + custom reports + API |
| `enterprise` | Enterprise | $0 (custom) | $0 | 0 | true | unlimited | unlimited | unlimited | unlimited | all 9 | all 6 | Full + dedicated quota + SSO |

Feature-flag catalogue: 24 flags across 5 categories (cabinet,
integration, ai_agent, feature, limit). Plan ↔ flag mapping via
`plan_features` (52 seeded rows).

**Important property:** A "Standard" customer gets BOTH Mgmt cabinets
AND Dev cabinets at the same tier. The DB seed never splits "Mgmt
only" from "Dev only" — every paid tier includes both products,
capped by villa/project limits.

## Source 2 — marketing config (`src/lib/billing/pricing.ts`, Stage 10.I.4)

The hardcoded module driving `/pricing/management-os` and
`/pricing/development-os` via the shared `<PricingPage>` component
(`src/components/marketing/pricing-page.tsx`). **Two-dimension** —
separate per-product plans.

### Management OS plans

| key | name | monthly | limit | features (abbreviated) |
|---|---|---|---|---|
| `starter` | Starter | **$99** | Up to 3 villas | 7 OTAs, owner statements, 1 AI agent, mobile PWA, 48h email support |
| `professional` | Professional ★ | **$299** | Up to 15 villas | + All 9 AI agents, owner stays, dynamic pricing, direct bookings, API + 5 webhooks, 12h support |
| `enterprise` | Enterprise | custom | 16+ villas | + Unlimited AI, custom integrations, dedicated CSM, SLA, optional self-host |

### Development OS plans

| key | name | monthly | limit | features (abbreviated) |
|---|---|---|---|---|
| `starter` | Starter | **$199** | 1 active project | BOQ + drawings, procurement PR→PO, QA/QC, investor portal, 48h support |
| `professional` | Professional ★ | **$499** | Up to 5 projects | + Multi-project, QS + Risk Radar AI, capital ledger + waterfalls, sales pipeline, doc extraction, API + 10 webhooks, 12h support |
| `enterprise` | Enterprise | custom | 6+ projects | + Unlimited, ERP integrations, cabinet customisation, SLA, optional self-host |

**Property:** Marketing config splits Mgmt vs Dev as separate product
purchases. Customer wanting both would buy two subscriptions.

## Source 3 — Sprint 3a tiers (`src/lib/marketing/pricing-tiers.ts`)

The new module driving the consolidated `/pricing` page on
`subscription.arconique.com`. **Three-dimension** — Mgmt-only,
Dev-only, **Bundle**.

### Management only

| key | name | monthly | villas | users | AI calls / mo | features (abbreviated) |
|---|---|---|---|---|---|---|
| `starter` | Starter | **$79** | 5 | 3 | 100 | 7 OTAs, owner statements, 1 AI agent, mobile PWA, 48h |
| `pro` | Pro ★ | **$199** | 25 | 10 | 500 | + All 9 AI, owner stays, dynamic pricing, API + webhooks, 12h |
| `scale` | Scale | **$499** | 100 | 25 | 2000 | + Multi-portfolio rollups, custom integrations, CSM, 4h |
| `enterprise` | Enterprise | custom | custom | custom | custom | + SLA, self-host option |

### Development only

| key | name | monthly | projects | users | AI calls / mo | features (abbreviated) |
|---|---|---|---|---|---|---|
| `starter` | Starter | **$149** | 1 | 5 | 200 | BOQ + drawings, procurement, QA/QC, investor portal (1), 48h |
| `pro` | Pro ★ | **$349** | 3 | 15 | 1000 | + Multi-project, QS + Risk Radar AI, capital ledger, sales pipeline, 12h |
| `scale` | Scale | **$799** | 10 | 40 | 3000 | + Cross-project pools, doc extraction at scale, CSM, 4h |
| `enterprise` | Enterprise | custom | custom | custom | custom | + SLA, self-host option |

### Bundle

| key | name | monthly | villas | projects | users | AI calls / mo |
|---|---|---|---|---|---|---|
| `starter` | Starter | **$199** | 5 | 1 | 8 | 300 |
| `pro` | Pro ★ | **$499** | 25 | 3 | 25 | 1500 |
| `scale` | Scale | **$1,199** | 100 | 10 | 65 | 5000 |
| `enterprise` | Enterprise | custom | custom | custom | custom | custom |

Bundle = both products in one workspace + single sign-on + cross-
product reporting + cross-product audit trail.

---

## Side-by-side comparison

### Mgmt-only customer, 10 villas

| | DB seed | Marketing 10.I.4 | Sprint 3a tiers |
|---|---|---|---|
| Tier to choose | Standard ($299) | Professional ($299) | Pro ($199) |
| Tier name | Standard | Professional | Pro |
| What's NOT included | dynamic pricing (no flag) | — | — |
| User seats | 15 | (unspecified) | 10 |
| AI cap | $500/mo | 1,000 invocations/mo | 500 calls/mo |

### Dev-only customer, 3 projects

| | DB seed | Marketing 10.I.4 | Sprint 3a tiers |
|---|---|---|---|
| Tier to choose | Standard ($299) | Professional ($499) | Pro ($349) |
| Tier name | Standard | Professional | Pro |
| Project cap honoured | 3 ✓ | 5 ✓ | 3 ✓ |
| Dev-specific feature breadth | basic only (no QS/Risk Radar in Standard) | full Dev Pro | full Dev Pro |

### Both products, 10 villas + 3 projects

| | DB seed | Marketing 10.I.4 | Sprint 3a tiers |
|---|---|---|---|
| Tier to choose | Standard ($299) — single sub covers both | Mgmt Pro ($299) **+** Dev Pro ($499) = **$798** | Bundle Pro ($499) |
| Architecture | one org_subscription row | two org_subscription rows (org_subscriptions UNIQUE on (org_id, plan_code, period) supports this) | one row |
| Annualised | $3,588 | $9,576 | $5,988 |

The three models price the same customer at **$299**, **$798**, or
**$499** — a 2.7× spread.

---

## DB seed reality (what's actually in `subscription_plans` after migrate)

After running `db:migrate`, the `subscription_plans` table contains
the 6 seeded plans above. Every row has `stripe_product_id = NULL`,
`stripe_monthly_price_id = NULL`, `stripe_annual_price_id = NULL`.

There is no script to auto-create Stripe products. Stripe wiring is
deferred to Sprint 3b — the schema is ready but no rows have been
linked to Stripe yet.

`org_subscriptions` rows reference `plan_code` (FK) but the only ones
currently used would be `trial` (default on signup, 14 days) and
`internal` (admin-comp). No real customer is on `basic` / `standard`
/ `pro` / `enterprise` yet (production seed at
`scripts/seed-production-minimal.ts` would tell us — not inspected
beyond the file name).

## Stripe state — nothing wired

| Probe | Result |
|---|---|
| `STRIPE_*` in `.env.example` | **None** — no documented env vars |
| `STRIPE_SECRET_KEY` referenced in code | yes, in `src/app/api/billing/checkout/route.ts` + `readStripeKeys()` |
| `STRIPE_PUBLISHABLE_KEY` referenced | yes, same file |
| `STRIPE_BILLING_WEBHOOK_SECRET` referenced | yes, in `src/app/api/webhooks/billing/stripe/route.ts` |
| `stripe.products.create` calls | **None** |
| `stripe.prices.create` calls | **None** |
| Hardcoded `price_xxx` IDs | **None** |
| `subscription_plans.stripe_product_id` populated | **No** (NULL in seed) |
| Checkout endpoint behaviour without keys | returns `{ ok: false, reason: "stripe_not_configured" }` HTTP 503 |

The plumbing is in place; the actual product/price provisioning is
unwritten. Whoever wires Sprint 3b will need to either:

- Run a one-shot script that `stripe.products.create()`s one product
  per `plan_code` and `stripe.prices.create()`s a monthly + annual
  price each, then `UPDATE subscription_plans SET stripe_*_id =
  …`; OR
- Manually create products in Stripe Dashboard and paste the IDs into
  a migration / seed.

---

## Cabinet/feature flags — only the DB seed has them

Critical reconciliation point: **only the DB seed knows which
cabinets a plan unlocks.** The marketing configs (Sources 2 and 3)
describe features in prose ("All 9 AI agents", "BOQ + drawings") but
don't encode the cabinet/integration/ai_agent flags that
`enforceProductAccess()`, `gateCabinetForCurrentOrg()`, and the
runtime gating actually consume.

Implication: **the marketing pricing IS NOT the gating pricing.** If
a customer buys "Mgmt Pro" at $199 via the new `/pricing` page,
something — Stripe webhook → `stripe-subscription-bridge.ts` — has
to map them to a `plan_code` row in `subscription_plans`. Today no
such mapping exists between any of the three names sets:

- DB plan codes: `internal`, `trial`, `basic`, `standard`, `pro`, `enterprise`
- 10.I.4 tier keys: `starter`, `professional`, `enterprise` (× 2 products)
- Sprint 3a tier keys: `starter`, `pro`, `scale`, `enterprise` (× 3 plans)

---

## Recommendation — minimum-rework reconciliation

The cheapest path to a single source of truth depends on what the
operator wants the pricing model to *be*. Three options, ranked by
amount of work needed:

### Option A — Adopt the Sprint 3a model (4-tier × 3-plan), retire the others

**Work required:**
- Drop the 10.I.4 marketing config (`src/lib/billing/pricing.ts`).
  Delete `/pricing/management-os` and `/pricing/development-os`
  pages.
- Migration 0096 to replace the DB seed: rename / add plan_codes to
  match `mgmt-starter`, `mgmt-pro`, `mgmt-scale`, `mgmt-enterprise`,
  `dev-starter`, …, `bundle-starter`, …. Re-seed plan_features to
  match each new plan's feature surface.
- One-shot Stripe provisioning script: ~12 products
  (4 tiers × 3 plans) and 24 prices (monthly + annual each).
- Update workspace switcher + cabinet gating to handle "Mgmt-only"
  vs "Dev-only" vs "Bundle" — currently the cabinet gates assume
  the DB seed's one-plan-covers-both model. Non-trivial: every
  `gateCabinetForCurrentOrg()` call site needs review.

**Pros:** matches operator's Sprint 3a spec. Bundle is a real product.
**Cons:** biggest gating rewrite. Highest blast radius.

### Option B — Adopt the DB seed model (one plan covers both, with limits)

**Work required:**
- Update `src/lib/marketing/pricing-tiers.ts` to mirror Basic /
  Standard / Pro / Enterprise from the DB. Three columns become
  one — or stay three as a marketing surface that still resolves to
  the same `plan_code`s underneath (the "Bundle" column would just
  show the full price; "Mgmt-only" and "Dev-only" would have a
  caveat that you still pay the bundle price because the model is
  unified).
- Drop the 10.I.4 marketing config too (or update it to match the DB
  seed).
- Stripe provisioning: 4 products + 8 prices (Basic / Standard / Pro
  + custom Enterprise).
- No gating rewrite — the existing flags already work.

**Pros:** smallest engineering surface. Stripe wiring is trivial.
Cabinet gating already lines up.
**Cons:** loses the Bundle pricing arbitrage. Operator's
"Mgmt-only" at $79 entry-point goes away. Loses the per-plan
Mgmt-vs-Dev positioning that the operator clearly wants.

### Option C — Hybrid: keep DB seed as the gating source, marketing tiers as packaging

**Work required:**
- Keep DB seed as-is. Plan codes = gating source of truth.
- Add a thin mapping layer: each Sprint-3a marketing tier
  (`mgmt-only/pro`, `bundle/scale`, …) maps to a DB `plan_code` plus
  an explicit `products_enabled` array on the resulting
  `org_subscription` row. E.g. "Bundle Pro" → `plan_code: pro` +
  `products_enabled: ['mgmt','dev']`; "Mgmt-only Pro" → `plan_code:
  standard` + `products_enabled: ['mgmt']`.
- Stripe provisioning: 9 products (3 plans × 3 tiers, ignoring
  Starter which can stay on Trial/Basic) + 18 prices.
- Drop `src/lib/billing/pricing.ts` 10.I.4 config (the per-product
  `/pricing/*` pages get retired in favour of the new `/pricing`).
- Update checkout to honour the mapping at session creation.
- Cabinet gating uses the existing `plan_code` flag join AS WELL AS
  the new `products_enabled` array (already exists per Stage 10.H).

**Pros:** keeps the operator's marketing model. Preserves Bundle
arbitrage. Cabinet gating evolves additively (DB seed unchanged).
Single Stripe-products taxonomy.
**Cons:** introduces a non-obvious indirection (marketing tier →
plan_code mapping). Documentation burden.

### Recommended: **Option C**

Smallest blast radius on the engineering side (no gating rewrite, DB
seed untouched) while preserving the operator's marketing model from
Sprint 3a. The cost is a mapping layer + clear documentation —
acceptable for the value of keeping Bundle as a real upsell.

If the operator decides Bundle isn't strategically important after
all → fall back to Option B (cheapest).

If the operator wants the marketing model to be the source of truth
end-to-end → Option A (most work but cleanest mental model long-term).

## Open questions for the operator

1. **Is Bundle a real product, or marketing positioning?** If
   strategic → Option A or C. If positioning only → B.
2. **What's the Starter entry-point's purpose?** The DB seed has
   no Starter (Basic = $99 is the entry). The marketing surfaces
   advertise $79 (Sprint 3a) or $99 (10.I.4). Pick one.
3. **Do you want annual billing visible on the pricing page?** All
   three sources support annual; only Sprint 3a's UI gestures at it
   ("Annual saves 15%" copy). DB seed honours it via
   `annual_price_minor`. Stripe wiring will produce a price object
   per cycle.
4. **What happens to existing `trial` customers when Sprint 3b
   ships?** They live on `plan_code: trial` for 14 days. The new
   pricing page's "Start free trial" should still land them on
   `trial` — but the marketing copy implies they pick a tier first.
   Decide: tier-then-trial or trial-then-tier?

---

## Halt — no file edits.
