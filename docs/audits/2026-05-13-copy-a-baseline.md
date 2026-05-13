# Copy A — current-state baseline (re-audit)

**Date:** 2026-05-13
**Repo:** `github.com/nrazgulyaev/management-os` · branch `main`
**HEAD:** `9009cb9 Stage 10.7.0 — close 10.6 carry-over` (1 commit unpushed)
**Working tree:** clean (only `M tsconfig.tsbuildinfo`, gitignored build artefact)
**Total commits since `b5bc75e` (the shared ancestor with the Downloads fork):** 136

This document re-baselines what is actually in Copy A so future planning works
from reality, not the stale Downloads-fork audit. The earlier "Sprint 0 +
Phase A.1" report in the Downloads fork (Tremor install, DeepSeek provider
stub, dashboard apex rebuild) **has not landed here** — none of those 10 SHAs
exist in this repo. However, much of what the fork was trying to add has
already been done by a different name in Stage 10.6.

---

## 1. Stages shipped

The IMPLEMENTATION_ROADMAP defines Versions 0–10. The stage-letter system
(10.6.A → 10.7.0) is the in-flight execution log. Closure docs in
`docs/`:

| Stage | Status | Closure doc |
|---|---|---|
| 6.P0 → 6.P7 | shipped | `STAGE-6-P0…P7-COMPLETE.md`, `STAGE-6-COMPLETE.md` |
| 7.0, 7.F, 7.G | shipped | `STAGE-7-0/F-COMPLETE.md`, `STAGE-7-G-PRODUCTION-AUDIT.md` |
| 8 | shipped | `STAGE-8-COMPLETE.md` |
| 10.5.A | shipped | `STAGE-10-5-A-COMPLETE.md` (cabinet dashboard pattern locked) |
| **10.6 (A→F)** | **COMPLETE** | `STAGE-10-6-COMPLETE.md` (quality reset: 27 commits, 5080→5964 tests, ~70 pages modernised, SubscriptionOS launched as 5th workspace) |
| **10.7.0** | shipped | `9009cb9 Stage 10.7.0` (closes two carry-overs from 10.6: stage-label leaks + stale Stage 6 invoice test) |

**What's in flight:** nothing tracked under a stage label past `10.7.0`. The
operator-collected award-style references (doctor / logistics / recruiting /
PPC / crypto dashboards) explicitly drove **10.6.C** — the token foundation
and hero KPI variants already exist (see §3). Roadmap-wise, "Version 11"
is not declared in `IMPLEMENTATION_ROADMAP.md`; that label only exists in
the Downloads fork's draft and was never merged.

---

## 2. Chart library

**None installed.** `package.json` (full listing read) has zero of:
`recharts`, `@tremor/react`, `@tanstack/react-table`, `nivo`, `visx`,
`chart.js`, `echarts`. `grep` across `src/` returns no imports from any
chart library.

What is in place instead:
- [src/components/ui/sparkline.tsx](src/components/ui/sparkline.tsx) — a
  ~50-line hand-rolled SVG sparkline (line + endpoint dot, no axes, no
  tooltip).
- KPI/metric cards via [src/components/ui/metric-card.tsx](src/components/ui/metric-card.tsx) and
  [src/components/ui/primitives/dashboard-kpi.tsx](src/components/ui/primitives/dashboard-kpi.tsx) —
  no inline chart slot; KPIs are number + delta + status pill.
- All "data viz" surfaces (`PortfolioOverview`, `DashboardPulse`, cabinet
  trend strips) render numbers in tables/cards, not charts.

**Implication for any "award-style visual" pass:** a real chart library
is the missing primitive. The closure note for 10.6.C explicitly says
the token system is ready and "every aggregate must be clickable to
source" — but there is no line/bar/donut/area chart layer to plug in.

---

## 3. Design tokens

Tailwind v4 with `@theme inline` mapping in
[src/app/globals.css](src/app/globals.css) (304 lines, both light + dark
ramps). Highlights relevant to the "doctor-dashboard" reference:

| Token family | Light → dark | What it gives you |
|---|---|---|
| Canvas/surface | `#f8f5f0` → `#0c0e0d` | warm cream + true-dark, both supported |
| Accent | emerald `#0e3b2e` / `#4fb592` | the brand green, plus `--accent-weak` for fills |
| Gold | `#b08a3e` / `#d6b567` + `--gold-weak` | warm secondary accent |
| Data ramp | emerald · gold · stone · sage · terracotta · ink | 6-stop categorical palette (`--data-*`) — ready for charts that aren't there yet |
| Semantic weak fills | success/warning/danger/info-weak | for status badges + soft panels |
| **Stage 10.6.C.1 gradients** | `--gradient-emerald-soft`, `--gradient-gold-soft`, `--gradient-coral-soft`, `--gradient-ink-deep` | the **hero KPI tones** — emerald-soft / gold-soft / coral-soft pastel + deep-ink for primary KPI |
| **Stage 10.6.C.1 shadows** | `--shadow-soft-card`, `--shadow-elevated-card` | the rounded-3xl card mass; soft elevation |
| **Stage 10.6.C.1 radii** | `--r-2xl: 20px`, `--r-3xl: 24px`, `--r-4xl: 32px` | hero card geometry |
| Fonts | Fraunces (display) · Inter (sans) · JetBrains Mono (mono) | premium-editorial type |

**Verdict vs doctor-dashboard reference:** the palette is **closer than the
fork audit assumed**. Warm cream canvas, emerald-soft / gold-soft / coral-soft
gradient pastels, deep-ink hero card, soft shadows, rounded-3xl — all of the
*surface* tokens needed to mirror the doctor-dashboard's hero gradient + dense
KPI grid already exist. What's missing for the doctor look:

- A multi-axis chart layer (none — see §2).
- A donut / radial card primitive (the existing `DashboardKpi` is rectangular only).
- A profile rail / appointments-list pattern (no equivalent primitive today).
- An embedded chat/comms panel pattern (Operations Copilot card on `/dashboard` is the closest, but it is one static block, not a threaded panel).

Score (tokens only, not composition): **4 / 5 vs reference.** The atoms are
there; the compositions that use them are still text-heavy.

---

## 4. `/dashboard` apex page audit

File: [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx) · 307 lines.

What it renders, top → bottom:

1. **PageHeader** (NOT the newer `PageHeaderHero`/`CabinetGreetingBlock`
   that the cabinets use) — eyebrow date, narrative title, prose description
   with derived counts, two action buttons (Finance / Ops board).
2. **Live counts strip** — `LivePulseStrip` reading
   `getLiveDashboardCounts()` from the DB. Pure numeric tiles.
3. **`DashboardPulse`** — static composed component (not inspected here in
   detail, but no chart imports exist in the repo).
4. **`PortfolioOverview`** section — "MTD + YoY weighted across three
   projects." Card-only, no chart.
5. **Tonight's villa pulse** — 4-column grid of 8 villa cards (code, name,
   project, status pill, MTD revenue). Bordered card, no charts.
6. **Operational health** — two-column grid: housekeeping queue list +
   maintenance ticket list. Status pills, no charts.
7. **Owner payouts** — single bordered table-card with 5 rows.
8. **Operations Copilot** — one `accent-weak` panel with sparkles icon,
   narrative AI brief + 2 bullet suggestions + "Open Operations Copilot"
   button. Has a "Briefing not yet wired" footer note.

Checklist vs the doctor-dashboard reference:

| Reference element | Present on `/dashboard` today? |
|---|---|
| Hero metric card (gradient, 56–72pt value) | ❌ — uses `PageHeader` prose header, not a hero card |
| Gradient chart card with pinned tooltip | ❌ — no charts anywhere |
| Profile rail (avatar + meta column) | ❌ — single-column page |
| Schedule rows (timed list, today's appointments) | ⚠️ partial — "Tonight's villa pulse" and housekeeping queue are list-of-rows, but not timed/grouped like the reference |
| Donut/ratio card | ❌ — none |
| Embedded chat / comms panel | ❌ — AI brief is a static block, not a thread |
| Soft shadows + rounded-3xl card mass | ⚠️ partial — most cards still on `rounded-lg`+`rounded-md` border-line-soft, not the new `rounded-3xl shadow-soft-card` tokens added in 10.6.C.1 |

**Score vs doctor-dashboard: 2 / 5.** The Mgmt OS apex has not been
rebuilt on the new hero-tone tokens. The fork's `7049eed feat(dashboard):
rebuild /dashboard apex in award style` commit was attempting exactly
this; it did not land here. The closure doc for 10.6 confirms 10.6.C
focused on the **cabinet** dashboards (Dev OS), the list pages, the
detail/form pages, and the public/auth surface — but the Mgmt OS
`/dashboard` apex page was not in the C.1.2–.5 sweep.

---

## 5. Dev OS cabinets audit

Nine cabinets exist under
[src/app/(development-app)/development-os/cabinets/](src/app/(development-app)/development-os/cabinets/):

| Cabinet | LOC | Score | Notes |
|---|---|---|---|
| `cfo-accountant` | 346 | **4 / 5** | `CabinetGreetingBlock` + `PageHeaderHero` + hero `DashboardKpi` (variant=hero, tone=ink-deep, col-span-2) + 3 status KPIs + 30/60/90-day forecast strip + bookkeeper workload + 2-up AI insight cards + recent-tx feed. Closest to reference. **Missing:** any actual chart. |
| `project-manager` | 264 | 3 / 5 | Same skeleton — greeting + hero + KPIs + sections. Text-dense, no chart. |
| `site-supervisor` | 253 | 3 / 5 | Same pattern; field-ops bias. |
| `marketing-staff` | 234 | 3 / 5 | KPI + funnel-as-list, no chart. |
| `sales-manager` | 221 | 3 / 5 | KPI grid + manager-performance table. |
| `procurement-manager` | 180 | 3 / 5 | KPIs + RFQ-status callouts. |
| `qs` | 176 | 3 / 5 | KPIs + BoQ workload counters. |
| `warehouse-manager` | 172 | 3 / 5 | KPIs + stocktake counters. |
| `my-cabinet` | **13** | 1 / 5 | 13-line **redirect-only** page — by design (it routes the operator to their role-specific cabinet). Not a visual surface. |

**Pattern (8 substantive cabinets):** all use the Stage 10.6.C.1 primitives:
`CabinetGreetingBlock` (with avatar gradient ring), `PageHeaderHero`, hero
`DashboardKpi` with `variant="hero"` + ink-deep/emerald-soft tone +
col-span-2, status-coded delta KPIs, `Section` wrappers, `Badge`/
`StatusPill` for state. Composition is consistent and on-brand.

**What still drops the score from 5 to 3:** zero charts. Every value is a
formatted number string with a delta percentage. The doctor-dashboard
reference's visual richness comes from gradient chart cards, donut splits,
sparkline-on-KPI inserts — none of which exist as primitives.

`DashboardKpi` already has a `sparkline?: React.ReactNode` slot that is
currently unused — adding the existing custom `Sparkline` (or a real
chart library) into that slot would lift every cabinet by ~1 point with
no per-page changes.

---

## 6. AI providers

[src/lib/ai/providers/](src/lib/ai/providers/) contains:

| File | Status |
|---|---|
| `anthropic.ts` (184 LOC) | live default — Claude 3.5 Sonnet |
| `openai.ts` (167 LOC) | live, opt-in via `AI_PROVIDER=openai` |
| `gemini.ts` (190 LOC) | live, opt-in via `AI_PROVIDER=gemini` |
| `dry-run.ts` (68 LOC) | deterministic fallback when no key + in tests |
| `types.ts` (113 LOC) | shared `AIProvider` interface |
| `index.ts` (118 LOC) | `getAIProvider()` factory + per-agent override via `getAIProviderByName` |

**DeepSeek provider: NOT PRESENT.** The fork's `70fe8bf feat(ai): add
deepseek provider + api_credentials schema (no UI yet)` did not land
here.

**BYO API key infrastructure: ALREADY PRESENT, by a different name.**
Migration [drizzle/0095_org_ai_agent_config_provider.sql](drizzle/0095_org_ai_agent_config_provider.sql)
(Stage 10.5.B) extends `org_ai_agent_config` with:

- `provider text` — per-org per-agent provider routing
- `model text` — per-org model override
- `api_key_encrypted jsonb` — AES-256-GCM envelope `{v, k, c}` using
  `STAY_LINK_KMS_SECRET` (same envelope as channel credentials + Wi-Fi
  passwords)
- `api_key_set_at`, `last_test_status`, `last_test_at`, `last_test_error`
  — test-connection observability

**This is what the fork's "api_credentials schema" would have duplicated.**
The `org_ai_agent_config`-embedded approach is the canonical wiring here:
one row per (org, agent_key), key stored encrypted inline.

The BYO UI exists at
[src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/provider-config-form.tsx](<src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/provider-config-form.tsx>)
— so end-to-end (DB + form + runner-side override via 10.6.B.3) is live for
the 3 supported providers.

---

## 7. Multi-tenant / subdomain / Subscription OS

### Middleware

[src/middleware.ts](src/middleware.ts) — present. Stage 7.E "Tenant subdomain
resolver". Parses the host header:

- `<slug>.arconique.com` → stamps `x-tenant-slug: <slug>` on the response
- `<slug>.localhost` → same, for local dev
- Reserved subdomains pass through with no tenant context:
  `app, www, api, marketing, status, docs, public, investors, admin`
- Apex `arconique.com`, `vercel.app`, `127.0.0.1` → no tenant context
- Custom domains → header carries raw host; resolution is deferred to
  server components reading `organizations.custom_domain`

**Critical:** the middleware does **per-tenant** subdomain routing
(`acme.arconique.com` → org `acme`), not **per-product** subdomain routing
(`management.arconique.com` / `development.arconique.com` /
`subscription.arconique.com`). All three product surfaces today live on
**path groups** of the same host: `(dashboard)/dashboard/*`,
`(development-app)/development-os/*`, `(subscription-app)/subscriptions/*`.

### Subscription OS / Platform Admin

Shipped in **Stage 10.6.E** as the 5th workspace. Routes:

```
src/app/(subscription-app)/subscriptions/
├── page.tsx                # landing
├── organizations/          # list of all orgs (super_admin)
├── [orgCode]/              # per-org detail
├── revenue/                # MRR / ARR / cohort
├── usage/                  # aggregate metrics
└── audit/                  # platform.* event log
```

Properties (per the 10.6.E closure entry):
- `super_admin`-gated; bypasses `enforceProductAccess()` because it is
  platform-admin, not product-gated
- 5 server actions wired: `extendTrialAction`, `markAsCompAction`,
  `cancelSubscriptionAction`, `startImpersonationAction`,
  `endImpersonationAction` — all enforce `requireSuperAdmin()`
- Impersonation: httpOnly+sameSite=lax cookie, 1h TTL, sticky warning
  banner, emits `platform.impersonate.start/end` audit events
- **Honest carry-over** (documented in 10.6.E closure): the actual
  `org_id` resolution swap during impersonation is NOT yet wired in
  middleware/RLS. The banner + cookie + audit ship; the data view still
  reads the operator's own org. Real impersonation lands in a focused
  follow-up that pairs with RLS policy review.

Workspace switcher already surfaces SubscriptionOS to super_admin users.

---

## 8. Stripe / billing

Present and wired.

**Code surface:**
- [src/lib/billing/](src/lib/billing/) — `pricing.ts`, `gating.ts`,
  `cabinet-gating.ts`, `cabinet-flags.ts`, `lifecycle.ts`,
  `lifecycle-pure.ts`, `stripe-subscription-bridge.ts`
- [src/app/api/webhooks/billing/stripe/route.ts](<src/app/api/webhooks/billing/stripe/route.ts>)
  — webhook handler for billing events
- [src/app/api/webhooks/payments/stripe/route.ts](<src/app/api/webhooks/payments/stripe/route.ts>)
  — separate webhook for direct-booking payment intents
- Lifecycle FSM in `lifecycle-pure.ts` (pure functions) +
  `lifecycle.ts` (DB-bound transitions). Stripe webhook events map onto
  the FSM via `stripe-subscription-bridge.ts`, emitting structured audit
  with `actorKind: "stripe_webhook"`.

**Schema:**
- [drizzle/0085_development_os_stage_7_b_subscription_plans.sql](drizzle/0085_development_os_stage_7_b_subscription_plans.sql)
  seeds `subscription_plans` (Internal, Trial, Basic, Standard, …),
  `feature_flags`, and `plan_features` (per-plan flag-or-limit mapping).
- Later migrations add `organizations.trial_state`,
  `organizations.products_enabled`, `organizations.last_trial_reminder_at`.

**Cron coverage:**
- `subscription-advance-lifecycle`
- `subscription-attempt-renewal`
- `subscription-warn-expiry`
- `subscription-archive-expired`
- `subscription-purge-archived`
- `dev-os-failed-subscriptions-cleanup`

**VERIFY:** whether the Stripe **env vars** in `.env.production.local` are
test keys, live keys, or placeholders — not inspected here (env contents
deliberately not read). The handler and FSM are wired; the live-vs-test
distinction is environment-config only.

---

## 9. Spreadsheet entry

[src/components/ui/primitives/spreadsheet-view.tsx](src/components/ui/primitives/spreadsheet-view.tsx)
**exists.** It is a Stage 10.B primitive:

- Tab moves across cells; Enter advances rows; Shift+Tab/Shift+Enter reverse
- Inline validation (red border + tooltip) without losing row context
- Per-column `suggestions` resolver for autocomplete
- Persistence delegated via `onCommit(rows)` — parent controls debouncing
  + server actions

The file's own header lists the intended consumers:
> Used by: 10.C Bookkeeper rapid invoice entry, 10.E QS BoQ editing,
> 10.H Procurement RFQ entry.

**Wiring status:** `grep -rl "SpreadsheetView" src/app/` returns **zero
matches** — the primitive is not yet imported by any page. Stages 10.C /
10.E / 10.H haven't happened. The primitive is ready to mount; the
operator-facing flows that should consume it are still on modal forms.

---

## 10. Gap vs the original V1 audit goals

| Goal | Status | Evidence |
|---|---|---|
| **Subdomain split (mgmt / dev / subscription)** | **partial** | Middleware exists but does *per-tenant* slug routing, not *per-product* product routing. All three apps live as path groups on one host. Reserved-subdomain list could be extended, but the layout/auth split per product is unbuilt. |
| **Subscription OS** | **done (MVP)** | Stage 10.6.E — 5 admin pages, super_admin gate, action wiring, impersonation scaffold. Carry-over: real `org_id` swap on impersonation requires middleware + RLS pairing. |
| **Award-winning visual** | **partial** | Tokens done (gradients, soft-card shadows, rounded-3xl, hero KPI variants). Dev OS cabinets composed on the new primitives (`CabinetGreetingBlock`, `PageHeaderHero`, hero `DashboardKpi`). **Missing:** chart library + chart cards, donut/ratio primitive, profile rail, comms panel — all "richness" that depends on a chart layer not yet installed. Mgmt OS `/dashboard` apex is not on the new hero-tone tokens. |
| **Spreadsheet entry** | **partial** | `SpreadsheetView` primitive shipped (10.B). Zero pages consume it yet. Bookkeeper invoice entry + QS BoQ + Procurement RFQ all still on modal/page forms. |
| **Multi-AI provider with BYO keys** | **partial** | 3 providers live (Anthropic / OpenAI / Gemini) + dry-run. Per-org encrypted key storage shipped in migration 0095 (the canonical "api_credentials" surface here). BYO UI exists at `/dashboard/settings/ai-agents/[agent_key]`. **Missing:** DeepSeek provider class, and an explicit `api_credentials` decoupled table (the fork's design — Copy A took a different, valid approach by embedding in `org_ai_agent_config`). |

---

## Appendix — items needing operator decision before any "Version 11"-style sprint

1. **Per-product subdomains vs path groups** — is the `management.` /
   `development.` / `subscription.` triplet still the target, or has the
   path-group model become acceptable? The middleware can be extended
   either way; the product-gate logic already handles separation.
2. **Chart library choice** — Recharts (the fork's pick: Tremor) is a
   default, but `@tremor/react` + the existing `--data-*` palette would
   give doctor-dashboard composition the fastest. Decision blocks any
   visual-richness pass.
3. **DeepSeek as a 4th provider** — is the cost-per-token case strong
   enough to justify another provider adapter, given Anthropic + OpenAI
   + Gemini already cover the workload? If yes, the adapter is ~200 LOC
   and `org_ai_agent_config.provider` already accepts free text.
4. **Spreadsheet wiring priority** — which of (Bookkeeper invoices /
   QS BoQ / Procurement RFQ) is the first-customer pain point? The
   primitive is ready; one flow can ship in days, all three in a sprint.
5. **Impersonation finishing** — the 10.6.E carry-over (real `org_id`
   swap in middleware + RLS) is the single biggest SubscriptionOS gap.
   Until it lands, "impersonate" is a banner-only stub.
6. **Mgmt OS `/dashboard` apex rebuild** — operator's "doctor-dashboard"
   reference applies here most visibly. Phase 10.6.C deliberately did
   not touch this page; rebuilding it on hero tokens + (once chosen)
   the chart library is the single highest-impact UI improvement.

---

*End of baseline. No source changes were made during this audit.*
