# 06 — Issues by severity (final ranking — CHECKPOINT 5)

Final P0/P1/P2/P3 ranking of every issue surfaced across CHECKPOINTS
1-4. Each item links to the per-section deep-dive that explains the
finding + 3-hypothesis diagnosis where applicable.

Phase 10.6.B/C/D/E/F sub-task lists with these issues threaded
through live in [`07-fix-priority-recommendations.md`](07-fix-priority-recommendations.md).

---

## P0 — blocks customer use (15 items, must fix in Phase 10.6.B)

### 13 confirmed 500 server errors in production

Captured 2026-05-10 from
`tmp/audit-production-results-checkpoint2.json` (audit-bot session,
production deployment `https://management-os-fawn.vercel.app`).
**13 confirmed hard 500s** — distinct from the 78+53 timeout entries
which were all confirmed harness flakiness via 45s-timeout retests.

| # | URL | Section file |
|---|---|---|
| P0-1 | `/dashboard/payments/providers` | [payments.md](01-mgmt-os-by-section/payments.md) |
| P0-2 | `/dashboard/payments/providers/new` | [payments.md](01-mgmt-os-by-section/payments.md) |
| P0-3 | `/development-os/banking` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #1 |
| P0-4 | `/development-os/banking/new` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #2 |
| P0-5 | `/development-os/marketing/connections` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #3 |
| P0-6 | `/development-os/marketing/connections/new` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #4 |
| P0-7 | `/development-os/platform/branding` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #5 |
| P0-8 | `/development-os/platform/organizations` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #6 |
| P0-9 | `/development-os/settings/api-keys` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #7 |
| P0-10 | `/development-os/settings/data-export` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #8 |
| P0-11 | `/development-os/settings/google-workspace` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #9 |
| P0-12 | `/development-os/settings/webhooks` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #10 |
| P0-13 | `/development-os/settings/whatsapp` | [_p0-500-diagnoses.md](02-dev-os-by-section/_p0-500-diagnoses.md) #11 |

**Root-cause estimate**: 5-7 unique fixes (paired pages share root
causes). Common pattern: defensive loaders that throw should return
empty arrays. **Effort**: ~10-15h total.

### Other P0 (operator-flagged behavioral)

| # | Issue | Source | Effort |
|---|---|---|---|
| P0-14 | `/dashboard/maintenance-intelligence/plans` "Generate due tasks" returns server error per operator | [maintenance-intelligence-plans.md](01-mgmt-os-by-section/maintenance-intelligence-plans.md) | ~4h |
| P0-15 | `/dashboard/concierge-ai` not connected end-to-end (customer-promise feature) | [concierge-ai.md](01-mgmt-os-by-section/concierge-ai.md) | ~6-12h (depends on hypothesis) |

---

## P1 — major UX / pattern violation (Phase 10.6.B-C)

### Systemic invariants broken (closed by single shared helpers)

| # | Issue | Scope | Fix path | Effort |
|---|---|---|---|---|
| P1-1 | **Modal-First Add violated** on ~43 of 64 list pages | Mgmt + Dev OS | Single shared `<ModalFirstAdd>` helper + per-page application | ~22-26h |
| P1-2 | **Cancel-button-as-`<Link>`** — 10-15 modal forms have Cancel that doesn't close modal | Co-shipped with P1-1 | Add `onCancel` prop, replace `<Link>` Cancel with `<Button onClick>` | ~3h (within P1-1) |
| P1-3 | **AI agent runner ignores per-org config** (Stage 10.5.B carry-over) | All 9 agents + Concierge AI | Wire `loadOrgAgentRuntimeConfig()` into `runAgent()`; cascade `organizationId` through `AgentRunArgs` | ~6-12h |
| P1-4 | **All 10 cabinets render empty in production** for audit-bot org | Production demo data | New `scripts/seed-audit-bot-demo.ts` + run `executive_metrics_daily` cron + 1 agent run-once each | ~8-10h |

### Per-page operator-flagged behavioral bugs

Each previously documented in detail in section files. Reproduction +
fix sketched per page.

| # | Page | Issue | Effort |
|---|---|---|---|
| P1-5 | `/dashboard/projects` | Add navigates to `/new`; Modal-First violation (in P1-1 batch) | covered by P1-1 |
| P1-6 | `/dashboard/villas` | Edit modal Cancel broken (in P1-2 batch) | covered by P1-2 |
| P1-7 | `/dashboard/villa-guides/wifi` | Delete affordance MISSING (not "broken") + Modal-First | ~4h |
| P1-8 | `/dashboard/bookings` | Existing bookings not editable (or intentional?) | ~3-6h |
| P1-9 | `/dashboard/bookings/calendar` | "New booking" → /new; Modal-First (in P1-1) | covered by P1-1 |
| P1-10 | `/dashboard/bookings/sync` | Sync modals don't function | ~4h |
| P1-11 | `/dashboard/bookings/rates` | "Enso Base Rate" not editable / not deletable | ~3h |
| P1-12 | `/dashboard/integrations/channels` | Cannot add new channel | ~4h |
| P1-13 | `/dashboard/guests` | Guests not editable (only phone visible) | ~2-4h |
| P1-14 | `/dashboard/guest-stays/tokens` | Cannot add token | ~2-3h |
| P1-15 | `/dashboard/guest-services/catalog` | Delete broken | ~2-3h |
| P1-16 | `/dashboard/maintenance-intelligence/templates` | Delete affordance MISSING | ~3h |
| P1-17 | `/dashboard/maintenance-intelligence/risk-feed` | "Scan risks" not working | ~3-6h |
| P1-18 | `/dashboard/maintenance-intelligence/plans` | "Generate due tasks" 500 (P0-14 above; also an Add modal-first candidate) | covered by P0-14 + P1-1 |
| P1-19 | `/dashboard/owner` not in Mgmt OS sidebar (operator finding) | ~1h |

---

## P2 — minor UX / pattern inconsistency (Phase 10.6.C / 10.6.D)

| # | Issue | Effort |
|---|---|---|
| P2-1 | All 10 cabinets visual fidelity gap vs reference screenshots (rounded-md vs rounded-3xl, 28pt KPIs vs 56pt+, neutral surfaces vs gradient cards, no character imagery) | 10.6.C ~2-3 weeks |
| P2-2 | Stage 10.5.A pattern not applied to non-cabinet Mgmt OS list pages (Villas, Wi-Fi, Maintenance Plans candidates for KPI hero) | 10.6.C ~1 week |
| P2-3 | 5 priority integrations lack Stage 10.5.B parity (Stripe, WhatsApp, Resend, channels, Google Workspace) | 10.6.D ~16-20h |
| P2-4 | Mobile horizontal-overflow on 4 pages (`/sign-up`, `/development-os/sales`, `/development-os/ai-agents`, `/dashboard/notifications`) | ~5h |
| P2-5 | Marketing-page hero typography vs reference screenshots | ~6h |
| P2-6 | KB area inconsistent Modal-First (BoQ + quality-standards compliant; method-statements + specifications violators) | covered by P1-1 |
| P2-7 | `<RowActionsMenu>` not adopted on most Mgmt OS list pages | ~6-8h (partial coverage) |
| P2-8 | `<DashboardKpi>` only on cabinets; not adopted on hubs | covered by P2-2 |
| P2-9 | `audit-urls.txt` regeneration to close coverage gaps (e.g., `/dashboard/owner` was missing) | ~1h |

---

## P3 — polish (Phase 10.6.F or beyond)

| # | Issue | Effort |
|---|---|---|
| P3-1 | Audit-bot demo-data realism (operator review after seed task ships) | ~2h iterative |
| P3-2 | `/development-os/quantity-surveying` placeholder — build full QS-rollup OR remove placeholder | operator decision |
| P3-3 | iOS Safari real-device review (touch targets, safe-area, rubber-band) | ~4h |
| P3-4 | Accessibility WCAG AA pass (axe-core + VoiceOver spot-check) | Stage 10.5.C scope; ~12-16h if expanded |
| P3-5 | Lighthouse runs on top-30 pages (Stage 10.5.C scope) | ~6h |
| P3-6 | 9 lower-priority integrations (Maps, SMS, Analytics, Banking, Marketing, Webhooks, API keys) reach 10.5.B parity | 10.6.F ~30-40h |
| P3-7 | 20 business-logic questions deep-research (operator-triaged top 8) | 10.6.F ~30-50h |

---

## Severity totals

| Severity | Count | Total effort |
|---|---|---|
| **P0** | 15 | ~30-40h |
| **P1** | 19 | ~50-70h (most absorbed by 4 systemic fixes) |
| **P2** | 9 | ~70-100h |
| **P3** | 7 | deferable / scheduled |

**Phase 10.6.B-F effort total**: ~150-210h ≈ 5-7 weeks of focused
work, matches launch-prompt's 5-week estimate when systemic fixes
absorb individual P1s.

---

## Quick-win opportunities (highest leverage)

Single fixes that close 5+ P0/P1 issues at once:

1. **Modal-First shared helper** (~22-26h) → closes P1-1, P1-2, P1-5, P1-6 (partial), P1-7 (partial), P1-9, P1-15 (partial), P1-18 (partial). **~8-9 issues closed by one component.**
2. **Defensive-loader pattern** (~10-15h) → closes P0-1 through P0-13. **13 P0s closed by one pattern application.**
3. **AI runner per-org wire-up** (~6-12h) → closes P1-3 + activates all 10 cabinet AI tiles + unblocks Concierge AI (P0-15). **2 P0/P1 + 10 cabinet tiles enabled.**
4. **Audit-bot demo seed** (~8-10h) → fills all 10 cabinets + every dashboard with content. **Visual-review enabler for entire 10.6.C.**

**Total quick-win budget**: ~46-63h closes ~25 issues (most of P0+P1).

---

## What this audit did NOT cover

Documented for transparency:
- Full `axe-core` accessibility scan (Stage 10.5.C scope)
- Lighthouse / Core Web Vitals (Stage 10.5.C scope)
- Real-device iOS Safari testing (deferred)
- Per-page Edit / Delete row-action verification (covered selectively;
  full sweep deferred to a CHECKPOINT 6 follow-up if operator wants)
- Touch-target size automated verification
- Security audit (no auth/RLS test sweep beyond audit-bot login)
- Performance budget per page (TTFB / TTI)
- Code-review of every per-section file's row actions

These can be additional Phase 10.6 sub-tasks or kept as Phase 10.5.C
deliverables.
