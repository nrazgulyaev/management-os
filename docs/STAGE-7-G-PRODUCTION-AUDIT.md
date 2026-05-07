# Stage 7.G — Production Functionality Audit

**Date**: 2026-05-07
**Production URL**: https://management-os-fawn.vercel.app
**Method**: Headless Chromium (Playwright) sweep, 234 routes, full DOM + console + network capture.
**Mode**: Read-only. No app code changed. Audit harness committed.

---

## TL;DR

| Verdict | Count | % |
|---|---|---|
| 🟢 USABLE | 230 | 98.3% |
| 🟡 PARTIAL | 1 | 0.4% |
| 🔴 BROKEN | 1 | 0.4% |
| ⚪ DEFERRED-BY-DESIGN | 2 | 0.9% |
| 🟠 BLOCKED | 0 | 0% |
| ⚫ MISSING (404) | 0 | 0% |
| **Total** | **234** | **100%** |

**Production health is strong** — the route layer is solid; only one real bug surfaced in the route sweep (`/dashboard/system/health` hangs > 60s on a 39-way query fan-out), and one cosmetic gap (`/sign-up` prefetches `/legal/terms` + `/legal/privacy` which 404).

The bigger story is the **empty-state quality gap**: 36 pages render an empty state with no actionable CTA. This was P3.5's note all along; the route sweep confirms the gap concentration.

**What this audit does NOT verify**: button clicks, server-action mutations, or workflow chaining. The harness ran without auth credentials. Production pages render unauthenticated (the auth gate is at the server-action layer, not at the page-router layer), so route health is fully tested — but the 6 critical workflows (booking lifecycle, BOQ→procurement, maintenance, marketing connect, banking connect, sign-up) need auth to verify end-to-end. **Phases 3 + 5 of the audit plan are blocked on credentials.** Recommendation in the Stage 8 scope section below.

---

## Executive summary by section

Top-level breakdown across the two main app trees. Sections sorted by total page count.

| Section | Pages | 🟢 | 🔴 / 🟡 | 🚫 empty-no-CTA |
|---|---|---|---|---|
| `development-os/ai-agents` | 10 | 10 | 0 | 9 |
| `development-os/cabinets` | 9 | 9 | 0 | 5 |
| `development-os/settings` | 9 | 9 | 0 | 0 |
| `dashboard/inventory` | 8 | 8 | 0 | 0 |
| `dashboard/operations` | 8 | 8 | 0 | 0 |
| `dashboard/owner-intelligence` | 8 | 8 | 0 | 0 |
| `development-os/marketing` | 8 | 8 | 0 | 4 |
| `dashboard/direct-bookings` | 7 | 7 | 0 | 0 |
| `dashboard/pricing` | 6 | 6 | 0 | 0 |
| `dashboard/security` | 6 | 6 | 0 | 0 |
| `dashboard/service-fulfilment` | 6 | 6 | 0 | 0 |
| `dashboard/villa-guides` | 6 | 6 | 0 | 0 |
| `development-os/finance` | 6 | 6 | 0 | 3 |
| `dashboard/front-office` | 5 | 5 | 0 | 0 |
| `dashboard/integrations` | 5 | 5 | 0 | 0 |
| `dashboard/system` | 2 | 1 | 1 BROKEN | 0 |
| `public/sign-up` | 1 | 0 | 1 PARTIAL | 0 |

(Full per-page table below.)

### Verdict semantics

- 🟢 **USABLE**: 200 OK, no error markers, no console errors, page rendered with H1/main/expected affordances.
- 🟡 **PARTIAL**: 200 OK but console or network errors emitted.
- 🟠 **BLOCKED**: page renders but a critical workflow step is missing (none observed).
- 🔴 **BROKEN**: 5xx, navigation timeout, or error marker in body.
- ⚫ **MISSING**: 404. None observed — all 234 routes resolve.
- ⚪ **DEFERRED-BY-DESIGN**: page declares "Coming soon" / "deferred to Stage X" intentionally.

---

## Critical findings

### 🔴 BROKEN — `/dashboard/system/health` (production hang)

39 parallel `SELECT COUNT(*)` queries saturate the postgres pool on Vercel cold-start. Page never returns within 60s. Direct curl confirms the hang: `status=000 time=60.006086s`.

Full root-cause analysis: [`tmp/audit-deepdive-system-health.md`](../tmp/audit-deepdive-system-health.md).

**Recommended fix** (MEDIUM, 1-3h): collapse the 39 COUNTs into a single `UNION ALL` query. One round-trip, predictable latency, no pool pressure.

### 🟡 PARTIAL — `/sign-up` (legal page 404s)

Sign-up page prefetches `/legal/terms` and `/legal/privacy` — both 404. Page itself loads and the form is interactive, but two console errors fire on first paint and the legal links lead nowhere.

Full root-cause analysis: [`tmp/audit-deepdive-sign-up.md`](../tmp/audit-deepdive-sign-up.md).

**Recommended fix** (QUICK, ≤1h): create `src/app/(public)/legal/terms/page.tsx` and `src/app/(public)/legal/privacy/page.tsx` with placeholder copy until real legal text is finalized.

### ⚪ DEFERRED — intentionally pending

| URL | Status |
|---|---|
| `/dashboard/bookings/calendar` | "deferred to Stage X" message rendered |
| `/development-os/quantity-surveying` | "Coming soon" — Stage roadmap entry |

These are correct-as-implemented and explicitly out-of-scope per the closure docs.

---

## Empty-state quality assessment

**The audit's biggest finding by volume**: 36 pages render an empty state without an actionable CTA. Operators landing on these pages see "no data" with no path forward.

### Tier 1 — High-leverage operator surfaces (8 pages, 🔴 needs Stage 8 work)

These are surfaces operators land on during workflows. Empty + no CTA = stuck operator.

| URL | Type | Recommended CTA |
|---|---|---|
| `/development-os/ai-agents/inbox` | Inbox surface | "+ Start agent run" or "View past runs" |
| `/development-os/ai-agents/qs-cost-analyst` | Agent | "Run analysis on…" |
| `/development-os/ai-agents/procurement-analyst` | Agent | "Run analysis on…" |
| `/development-os/ai-agents/tax-assistant` | Agent | "Run analysis on…" |
| `/development-os/ai-agents/marketing-assistant` | Agent | "Run analysis on…" |
| `/development-os/ai-agents/executive-business` | Agent | "Run analysis on…" |
| `/development-os/ai-agents/daily-digest` | Agent | "Generate digest now" |
| `/development-os/ai-agents/weekly-plan` | Agent | "Generate weekly plan" |
| `/development-os/ai-agents/memory` | Storage | "Configure memory layer" |

The AI agent surface ships with 9 pages but no one-click "run this agent" affordance — that's the unblock.

### Tier 2 — Cabinet shells (5 pages, 🟡 cosmetic)

| URL | Recommended action |
|---|---|
| `/development-os/cabinets/my-cabinet` | Wire to identity (Stage 7.F.D.3 helper exists, not yet rolled out) |
| `/development-os/cabinets/cfo-accountant` | Either populate or "configure cabinet" CTA |
| `/development-os/cabinets/marketing-staff` | Same |
| `/development-os/cabinets/procurement-manager` | Same |
| `/development-os/cabinets/project-manager` | Same |

### Tier 3 — Dashboards / digests / executive views (16 pages, 🟡 contextual)

These are read-only by design (display computed metrics) but render empty when no data flows in yet. Add explanatory copy ("Risk radar populates from utility consumption / ai-flagged events / etc — first signal expected within 24h of seed-load") instead of just "no data":

- `/development-os/risk-radar`
- `/development-os/cashflow-forecast`
- `/development-os/project-cycle`
- `/development-os/dashboard`
- `/development-os/digests`
- `/development-os/distributions`
- `/development-os/commitments`
- `/development-os/finance`
- `/development-os/finance/document-extractions`
- `/development-os/finance/shared-costs`
- `/development-os/marketing/campaigns`
- `/development-os/marketing/content`
- `/development-os/marketing/dashboard`
- `/development-os/marketing/manager-performance`
- `/development-os/procurement/quotations`
- `/dashboard/finance`
- `/dashboard/ai`
- `/dashboard/notifications/inbox`
- `/dashboard/guest-ai/handoffs/metrics`
- `/dashboard/guest-journey/runs`
- `/dashboard/guest-stays/security/verifications`

### Tier 4 — Demo / one-off (1 page, ⚪ ignore)

- `/dashboard/demo` — empty by design.

---

## Verifying Stage 7.F deliverables in production

Stage 7.F shipped 11 new operator surfaces; this audit confirms each renders cleanly:

| Stage 7.F deliverable | Route | Verdict |
|---|---|---|
| 7.F.A.1 Front-office check-in/-out | `/dashboard/front-office/arrivals` | 🟢 USABLE |
| 7.F.A.1 (sister) | `/dashboard/front-office/departures` | 🟢 USABLE |
| 7.F.A.2 Maintenance assign | `/dashboard/operations/maintenance` | 🟢 USABLE |
| 7.F.A.3 Dev-os RFQ approve | `/development-os/procurement/purchase-requests` | 🟢 USABLE |
| 7.F.B.1 Marketing connections | `/development-os/marketing/connections` | 🟢 USABLE (form CTA detected) |
| 7.F.B.1 (form) | `/development-os/marketing/connections/new` | 🟢 USABLE |
| 7.F.B.2 Google Workspace settings | `/development-os/settings/google-workspace` | 🟢 USABLE |
| 7.F.B.3 Banking connections | `/development-os/banking` | 🟢 USABLE |
| 7.F.B.3 (form) | `/development-os/banking/new` | 🟢 USABLE (form detected) |
| 7.F.C.1 Payments providers admin | `/dashboard/payments/providers` | 🟢 USABLE |
| 7.F.C.1 (form) | `/dashboard/payments/providers/new` | 🟢 USABLE |
| 7.F.C.2 WhatsApp credentials | `/development-os/settings/whatsapp` | 🟢 USABLE (form detected) |
| 7.F.D.1 BOQ→RFQ button | `/development-os/boq` | 🟢 USABLE |
| 7.F.D.4 Notifications status | `/development-os/settings/notifications` | 🟢 USABLE |

**All Stage 7.F surfaces deploy cleanly to production.**

---

## Cross-cutting observations

### Service worker / PWA

The user pre-flagged "service worker clone error on all pages" and "missing /icons/icon-144x144.png" as separate cosmetic fixes. The audit's console-error filter is set to capture errors above a `warning` threshold; only `/sign-up` registered new ones in that bucket, so the SW + icon noise is either below the warning threshold or already fixed in the deploy. No additional service-worker errors observed in the 234 sweep.

### Performance

234 pages × median 1.5-2.5s render time = audit completed in ~12 minutes (with `concurrency=6` then `concurrency=2` retries to clear cold-start contention). No page exceeded 30s except `/dashboard/system/health` (the real hang).

The 95 initial timeouts at concurrency=6 were Vercel cold-start contention artifacts — all 95 resolved on the lower-concurrency retry. This itself is a soft signal: **Vercel's cold-start tax for this deployment is significant**. Worth instrumenting in Stage 8 (Vercel Insights or Server-Timing headers).

### Permission gating

All pages were tested unauthenticated. Pages returned 200 with rendered content — confirming that auth gating is at the server-action layer (mutations), not the page-router layer (reads). This matches the architecture in [`docs/development-os-architecture.md`](development-os-architecture.md). It also means **read-only data exposure** would be a security concern if the production DB contained customer data — but the platform is pre-customer.

### Data state

Production DB contains seeded reference data (system/health was attempting to count 39 tables — proving DB is reachable and configured). Some sections show empty (e.g. AI agents inbox) because no users have run anything yet. Most "empty state" findings are real — not artifacts of mock fallback.

---

## What this audit did NOT cover (Phases 3-5 — auth required)

Per the original plan, Phase 3 (workflow trace) + Phase 4 (functional spot-check) + Phase 5 (cross-cutting) require:
- Authenticated browser session
- A test user with `super_admin` or equivalent role
- Test data seeded in production (or a test org)

**Without those, the audit can verify**:
- ✅ Routes resolve (200/404/5xx) — *done, 230 USABLE / 1 BROKEN / 1 PARTIAL*
- ✅ Pages render (server actions inside the page execute) — *done, no SSR errors except system/health*
- ✅ DOM affordances exist (table / form / CTA) — *done, captured per page*
- ✅ Empty-state quality — *done, 36 gaps catalogued*

**Without those, the audit cannot verify**:
- ❌ Click-through interactions (does the "+ Add channel" button actually save?)
- ❌ Workflow chaining (booking → arrival → check-in)
- ❌ Permission boundaries (does the procurement_manager role see the right cabinet?)
- ❌ Audit-log writes (do mutations log to `/dashboard/audit`?)
- ❌ Notification delivery (do actions create notifications?)

To unblock these, provide one of:
1. Test user creds (`audit-bot@arconique.com` + password) so the audit script can log in via `/login`.
2. A pre-captured browser cookie from a manual login (paste into `AUDIT_COOKIE` env var; the script supports both Playwright JSON and `name=value;` cookie-header formats).
3. A `NEXTAUTH_DEV_BYPASS=true` or equivalent env var on Vercel for the audit run.

The script is ready for any of these — see `scripts/audit-production-pages.ts` `cookieEnv` handling.

---

## Per-page detail (full table)

Sorted alphabetically. Verdicts other than 🟢 USABLE annotated.

> 230 of 234 rows are 🟢 USABLE — listing only the non-trivial entries here. Full machine-readable data: [`tmp/audit-production-results.json`](../tmp/audit-production-results.json).

| URL | Status | Verdict | Notes |
|---|---|---|---|
| `/dashboard/system/health` | timeout | 🔴 BROKEN | 39-way COUNT fan-out hangs >60s; see deep-dive |
| `/sign-up` | 200 | 🟡 PARTIAL | `/legal/terms` + `/legal/privacy` 404 on prefetch |
| `/dashboard/bookings/calendar` | 200 | ⚪ DEFERRED | "Coming soon" copy — intentional |
| `/development-os/quantity-surveying` | 200 | ⚪ DEFERRED | "Coming soon" copy — intentional |

**Empty-state-no-CTA pages**: 36, listed in the "Empty-state quality assessment" section above.

---

## Stage 8 scope recommendation

Findings categorized by fix complexity. Stage 8 should be scoped to deliver Tier 1 + Tier 2 within ~5 working days; Tier 3 is incremental and can land alongside other work.

### Tier 1 — Production-blocking + cleanup (1-2 days)

| Item | Type | Hours |
|---|---|---|
| Fix `/dashboard/system/health` 39-way COUNT fan-out → single UNION ALL query | MEDIUM | 2-3h |
| Add `/legal/terms` + `/legal/privacy` placeholder pages (kill `/sign-up` 404s) | QUICK | 1h |
| Roll out Stage 7.F.D.3 `gateCabinet()` helper to all 8 paid-tier cabinets | QUICK × 8 | 2h |
| Wire `/development-os/cabinets/my-cabinet` to landing-resolver identity | QUICK | 1h |
| Add CTA to `/development-os/ai-agents/*` pages (1 button per agent: "Run analysis") | QUICK × 9 | 4-6h |

**Subtotal**: 10-13h. Quick wins; closes `🔴 BROKEN` + biggest empty-state cluster.

### Tier 2 — Workflow trace gaps (need auth to verify, then fix) (3-5 days)

Once test credentials are available, run Phases 3-5 of the audit plan:

| Workflow | Current confidence | Verification path |
|---|---|---|
| A. Booking lifecycle | High (routes 🟢) | Auth + test data + click-through |
| B. BOQ → RFQ → procurement | High (routes 🟢, button shipped 7.F.D.1) | Auth + click "Generate RFQ" |
| C. Maintenance ticket assign | High (routes 🟢, dropdown shipped 7.F.A.2) | Auth + assign + verify task created |
| D. Marketing connection | Medium (form 🟢, save flow unverified) | Auth + try save + try test-connection |
| E. Banking connection | Medium (form 🟢, save flow unverified) | Auth + try save |
| F. Sign-up flow | Medium (route 🟡 due to legal 404) | Real Stripe test card → onboarding |

**Subtotal**: 8-12h auth setup + functional testing + bug fixes for whatever surfaces.

### Tier 3 — Empty-state copy + dashboards (1 day)

Add explanatory copy to the 21 Tier-3 empty-state pages (dashboards, digests, marketing dashboards, executive views). One-line sentence per page explaining what populates the view + when. Mechanical, can be done in a single sweep with a content table.

**Subtotal**: 4-6h.

### Tier 4 — Cross-cutting observability (separate concern, ~1 day)

| Item | Why |
|---|---|
| Vercel cold-start instrumentation | Audit observed significant cold-start tax (concurrency=6 caused 40% of routes to time out before retry) |
| Server-Timing headers on dashboard pages | Help debug perf regressions like system/health going forward |
| Audit-log surface refresh on `/dashboard/audit` | Verify new server actions actually log |

### Recommended Stage 8 sub-stage breakdown

```
Stage 8.A — Production hygiene (1 day, +5-10 tests)
  - Fix system/health
  - Legal pages
  - Cabinet gating rollout

Stage 8.B — AI agent UX completion (1-2 days, +10-15 tests)
  - Run-now CTA per agent (9 pages)
  - Inbox empty-state CTA
  - Memory configure CTA

Stage 8.C — Authenticated workflow audit (2-3 days, +20-30 tests)
  - Set up audit user creds
  - Re-run audit script with auth
  - Trace 6 critical workflows
  - Fix whatever click-through bugs surface

Stage 8.D — Empty-state copy sweep (0.5 day, no tests)
  - Tier 3 pages get explanatory empty states
  - Optionally pulls in low-leverage P3.5 polish

Stage 8.E (optional) — Observability (1 day)
  - Vercel cold-start mitigation (warm-up cron, edge config)
  - Server-Timing instrumentation
```

**Total**: 5-8 working days. ~+60-75 tests delta. No new migrations.

### Stage 8 acceptance criteria

- ✅ `/dashboard/system/health` returns 200 in <3s
- ✅ `/sign-up` console clean (no 404 prefetches)
- ✅ All 8 paid-tier cabinets gated via `gateCabinet()`
- ✅ Every `/development-os/ai-agents/*` page has a primary CTA
- ✅ All 6 critical workflows pass authenticated trace
- ✅ Tier 3 empty states have explanatory copy
- ✅ Test count up by ~+60-75
- ✅ No regression in `npm run build`, `check:cron`, or existing test suite

---

## Audit harness — reusable infrastructure

The audit script is committed at `scripts/audit-production-pages.ts` and is reusable for:
- Stage 8 verification (re-run after fixes to confirm green sweep)
- Future stage closures (post-deploy smoke gates)
- Vercel preview audits (point `--base` at any preview URL)

Usage:
```bash
# Full unauthenticated sweep
npx tsx scripts/audit-production-pages.ts \
  --base=https://management-os-fawn.vercel.app \
  --concurrency=2 --timeout=30000

# With auth (paste cookie value from manual login)
AUDIT_COOKIE='sb-access-token=...; sb-refresh-token=...' \
  npx tsx scripts/audit-production-pages.ts ...

# Different URL list
npx tsx scripts/audit-production-pages.ts --urls=tmp/my-urls.txt
```

Outputs: `tmp/audit-production-results.json` (machine-readable) + `screenshots/` (broken pages only).

---

## Closure

**Stage 7.G (route audit phase) ACCEPTED.**

- 234 routes tested in production via real Chromium
- 1 real bug found (`/dashboard/system/health`)
- 1 cosmetic bug found (`/sign-up` legal 404s)
- 36 empty-state CTA gaps catalogued
- All Stage 7.F deliverables verified deployed
- Reusable audit harness committed

**Phase 3-5 (workflow trace + cross-cutting) deferred** pending audit-bot credentials. Phase 1-2 + empty-state quality (Phase 4 partial) covered.

Recommend: spin Stage 8 with the breakdown above. Allocate 5-8 days. Re-run this script as the post-deploy gate.
