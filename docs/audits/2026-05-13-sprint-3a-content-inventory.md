# Sprint 3a — content inventory + deviation proposals (read-only audit)

**Date:** 2026-05-13
**Sprint:** 3a (subscription sales site)
**Author:** assistant, before any code changes

This is the Task 1 deliverable. It surfaces the gap between what the
Sprint 3a spec asks for and what already exists in the repo, and
proposes pragmatic deviations to avoid duplicate work and regressions.

---

## TL;DR — five surprises

1. **`/products/management-os` and `/products/development-os` already
   exist** as deep marketing/sales pages (290 + 285 LOC each). They
   were built in Stage 10.I.3 and use the exact composition Sprint 3a
   asks for (hero, use-cases, features grid, gradient closing CTA).
2. **`/pricing/management-os` and `/pricing/development-os` already
   exist** as per-product pricing pages, both driven by a shared
   `<PricingPage>` component and a comprehensive `ProductPricing`
   config at `src/lib/billing/pricing.ts`. Tiers + comparison rows +
   FAQ all defined.
3. **A working `/signup` already exists** with `<SignupForm>`,
   `signupAction` server action, and product= query-param support.
   The spec's Task 4 ("stub /signup placeholder") would be a
   regression.
4. **`/villa-management` and `/development`** marketing pages **do not
   exist** anymore — Stage 10.I.3 308-redirected them to
   `/products/management-os` and `/products/development-os`. The spec
   asks me to lift content from `/villa-management` but there's no
   `/villa-management` to lift from.
5. **The `/development-os` URL is taken** by the Dev OS app
   (`(development-app)/development-os/page.tsx`). I can't add
   `(public)/development-os/page.tsx` — Next.js would refuse to build
   on the route collision.

---

## What the spec asks for, vs what exists

| Spec deliverable | Status | What exists today |
|---|---|---|
| **`/` Sales hub** (Task 3.1) | NEEDED | `(public)/page.tsx` is the umbrella apex; Sprint 2 added an `x-product` branch with placeholder ProductLanding for subscription |
| **`/management-os` Mgmt OS sales detail** (Task 3.2) | DUPLICATE | `(public)/products/management-os/page.tsx` (290 LOC, full sales detail, Stage 10.I.3) |
| **`/development-os` Dev OS sales detail** (Task 3.3) | DUPLICATE + collision | `(public)/products/development-os/page.tsx` (285 LOC) + URL `/development-os` already owned by Dev OS app |
| **`/pricing` consolidated 3-column** (Task 3.4) | PARTIAL | per-product `/pricing/management-os` + `/pricing/development-os` exist; no `/pricing` top-level page; no Bundle tier in existing config |
| **`/signup` placeholder** (Task 4) | REGRESSION RISK | `(public)/signup/page.tsx` already wired to `signupAction` |

---

## File inventory under `src/app/(public)/`

| File | LOC | Status |
|---|---|---|
| `page.tsx` | 361 | umbrella apex marketing + Sprint 2 product branching |
| `products/management-os/page.tsx` | 290 | Mgmt OS sales detail (Stage 10.I.3) |
| `products/development-os/page.tsx` | 285 | Dev OS sales detail (Stage 10.I.3) |
| `pricing/management-os/page.tsx` | 13 | wraps `<PricingPage>` with `MANAGEMENT_OS_PRICING` |
| `pricing/development-os/page.tsx` | 13 | wraps `<PricingPage>` with `DEVELOPMENT_OS_PRICING` |
| `signup/page.tsx` | 51 | wraps `<SignupForm>` with product= param |
| `owner-portal/page.tsx` | 154 | uses Owner-Portal-specific components |
| `operations/page.tsx` | 162 | uses status board summary |
| `investor-reporting/page.tsx` | 181 | uses ManagementModels + AIPayoutExplainer + OwnerStatementPreview |
| `guest-experience/page.tsx` | 185 | uses guest-experience iconography |
| `portfolio/page.tsx` | 85 | three project showcase |
| `case-studies/page.tsx` | 58 | case-study card grid |
| `contact/page.tsx` | 193 | contact form |

## Library inventory

| File | LOC | Purpose |
|---|---|---|
| `src/lib/billing/pricing.ts` | 250+ | `ProductPricing` types, `MANAGEMENT_OS_PRICING`, `DEVELOPMENT_OS_PRICING`, formatters, trial copy |
| `src/components/marketing/pricing-page.tsx` | 257 | Shared per-product pricing renderer (hero + tier cards + comparison matrix + FAQ + CTA) |
| `src/components/marketing/*` | — | hero-section, editorial-section, platform-preview, trust-strip, pillar-grid, management-models, project-card, case-study-card, connect-marketing-form |
| `src/features/signup/actions.ts` | (exists) | `signupAction` Zod-validated server action |

## Existing pricing tier model (in `src/lib/billing/pricing.ts`)

Per product: **3 tiers** named Starter / Professional / Enterprise.

| | Mgmt Starter | Mgmt Pro | Mgmt Enterprise | Dev Starter | Dev Pro | Dev Enterprise |
|---|---|---|---|---|---|---|
| Price/mo | **$99** | **$299** | custom | **$199** | **$499** | custom |
| Cap | 3 villas | 15 villas | 16+ | 1 project | 5 projects | 6+ |
| AI invocations | 100 | 1000 | unlimited | (n/a) | (n/a) | (n/a) |

## Sprint 3a spec's pricing tier model (in Task 3.4)

Three **products** (Mgmt only / Dev only / **Bundle**), each with **3 tiers + Enterprise**:

| Product | Starter | Pro | Scale | Enterprise |
|---|---|---|---|---|
| Mgmt only | $79 / 5 villas / 3 users / 100 AI | $199 / 25 / 10 / 500 | $499 / 100 / 25 / 2000 | custom |
| Dev only | $149 / 1 project / 5 / 200 | $349 / 3 / 15 / 1000 | $799 / 10 / 40 / 3000 | custom |
| Bundle | $199 / 5+1 / 8 / 300 | $499 / 25+3 / 25 / 1500 | $1199 / 100+10 / 65 / 5000 | custom |

**These are fundamentally different pricing models.** The existing
config has 3 tiers per product and no Bundle. The spec asks for 4
tiers per product (Starter/Pro/Scale/Enterprise), a Bundle dimension,
and totally different prices + caps.

If we ship the spec's pricing, we have **two contradictory pricing
pages** until Sprint 3b unifies them (existing `/pricing/management-os`
shows old prices, new `/pricing` shows new). Operator needs to decide
which is the canonical model.

---

## Proposed deviation plan

Rather than building duplicate pages and risking regressions, this is
what I'll do — explicitly flagged for operator review:

### Honour literally

1. **Sales hub apex** (Task 3.1) — `(public)/page.tsx` already has
   the Sprint-2 branch on `x-product`. Add a `subscription` arm that
   renders a new `<SalesHub>` component. Build the component fresh
   per spec.
2. **Consolidated `/pricing` top-level page** (Task 3.4) — build
   new at `(public)/pricing/page.tsx`. Three columns (Mgmt only /
   Dev only / Bundle). New pricing module at
   `src/lib/marketing/pricing-tiers.ts` per spec — coexists with
   `src/lib/billing/pricing.ts` for now; Sprint 3b reconciles when
   Stripe wires in.
3. **Middleware allowedPrefixes update** (Task 2) — extend
   subscription subdomain's allowedPrefixes to include the routes
   that actually exist: `/products`, `/pricing`, `/signup`,
   `/contact`, `/owner-portal`, `/investor-reporting`,
   `/guest-experience`, `/operations`, `/portfolio`,
   `/case-studies`. (Sprint 2 listed `/management-os` and
   `/development-os` — those would either duplicate `/products/*`
   or collide; not used.)
4. **DEV-SETUP.md update** — Sprint 3a curl recipes refer to the
   actual routes (`/products/management-os`, `/pricing`, etc.) on
   `subscription.localhost`.

### Deviate (with rationale)

5. **`/management-os` and `/development-os` URL paths** (Tasks 3.2,
   3.3) — NOT created. The Mgmt-OS sales detail page already lives
   at `/products/management-os` (290 LOC of operator-approved Stage
   10.I.3 content). The Dev-OS sales URL would collide with the Dev
   OS app's `/development-os`. Resolution: keep the existing
   `/products/*` URLs and link the Sales hub directly to them. The
   spec's choice of "/management-os" path was driven by a desire to
   avoid `/management` and `/development` confusion — `/products/*`
   solves the same problem.
6. **`/signup` placeholder** (Task 4) — NOT replaced. The existing
   `/signup` page is wired to a working `signupAction` and a
   `<SignupForm>` component. Replacing with a placeholder would
   regress functional code. Sprint 3b should evolve the existing
   form, not rebuild it.

### Open question for operator (NOT decided in Sprint 3a)

7. **Pricing-tier reconciliation.** The existing
   `MANAGEMENT_OS_PRICING` / `DEVELOPMENT_OS_PRICING` configs
   (Stage 10.I.4) and the spec's new 3-column model have
   incompatible prices, caps, and tier names (3 tiers vs 4 tiers).
   Sprint 3a will ship the spec's new model at `/pricing`; the old
   per-product pages will continue to show the old prices until
   Sprint 3b. Operator: pick one canonical model. Recommendation:
   adopt the spec's 4-tier model + Bundle as canonical; deprecate
   the existing `/pricing/management-os` and
   `/pricing/development-os` in Sprint 3b (Stripe-wiring sprint).

---

## Visual quality of existing pages (1–5 vs reference)

| Page | Score | Notes |
|---|---|---|
| `(public)/page.tsx` (umbrella) | 4 | uses HeroSection + EditorialSection + PillarGrid + ManagementModels + ProjectCard + CaseStudyCard; on-brand |
| `/products/management-os` | 4 | hero + use-cases + features + emerald-soft closing CTA — matches operator reference for "sage Mgmt OS" |
| `/products/development-os` | 4 | parallel structure with gold accents — matches "gold Dev OS" reference |
| `/pricing/{management,development}-os` (via `<PricingPage>`) | 3 | tier cards + comparison matrix + FAQ; clean but text-dense, no gradient hero cards on tier columns |
| `/owner-portal`, `/operations`, etc. | 3 | use HeroSection + EditorialSection; usable but could use 10.6.C.1 hero token uplift |
| `/signup` | 4 | clean form on rounded-3xl shadow-elevated-card |

The visual baseline is already 3–4/5. The new SalesHub + consolidated
/pricing in Sprint 3a should target **4–5** by leaning into the new
10.6.C.1 gradient hero tokens (emerald-soft / gold-soft / coral-soft
for trial CTA), rounded-3xl card mass, and Fraunces display headlines.

---

## Tasks I'll execute after operator review of this doc

1. Task 2 — middleware allowedPrefixes for subscription, using the
   routes that actually exist (see "Honour literally #3" above)
2. Task 3.1 — `<SalesHub>` component + subscription arm in
   `(public)/page.tsx`
3. Task 3.4 — `/pricing` consolidated 3-column page + new
   `src/lib/marketing/pricing-tiers.ts`
4. Task 5 — acceptance gates + closure doc

Skipping Tasks 3.2, 3.3, 4 with explicit rationale (see "Deviate"
above). All decisions documented in the closure doc.
