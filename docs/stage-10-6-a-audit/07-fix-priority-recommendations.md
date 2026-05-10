# 07 — Fix priority recommendations & Phase 10.6.B-F prompt seeds

End-state of CHECKPOINT 5. Each Phase 10.6.B-F sub-section below is
a complete prompt seed — operator can edit lightly + paste back to
launch the corresponding phase.

**Total Phase 10.6 effort**: ~150-210h ≈ 5-7 weeks (matches
launch-prompt master estimate ✓).

---

## Sequencing rationale

Order matters. The recommended flow:

```
10.6.B (critical fixes, ~3 weeks)
  ↓ ships defensive loaders, demo seed, AI runner wire-up, Modal-First helper
  ↓ unblocks visual review of populated cabinets
10.6.C (UI modernization, ~3-4 weeks)
  ↓ applies reference-screenshot vibe to cabinets + non-cabinet hubs
  ↓ catches mobile overflow + marketing typography
10.6.D (integrations + AI, ~2 weeks)
  ↓ 5 priority integrations to Stage 10.5.B parity
  ↓ AI per-org runtime fully operational
10.6.E (SubscriptionOS, ~2 weeks)
  ↓ requires 10.6.B platform-side P0 500 fixes + Stripe end-to-end
  ↓ ships /admin route group + revenue dashboard + customer drill-down
10.6.F (business-logic deep work, ~3 weeks)
  ↓ operator-triaged top 8 of 20 questions + remaining lower-priority polish
```

---

## ═══════════════════════════════════════════════════════════
## Phase 10.6.B — Critical fixes prompt seed (~3 weeks, ~70-90h)
## ═══════════════════════════════════════════════════════════

```
# Phase 10.6.B — Critical fixes
## Stage 10.6 — Quality reset, fix-it sub-phase

**Type**: P0 + systemic-P1 fixes per Stage 10.6.A audit
**Estimate**: 3 weeks (~70-90h)
**Tests target**: ~50-60 (mostly regression coverage for fixed P0s)
**Migrations**: 0-1 (only if defensive-loader fix needs schema)
**Approach**: 4 sub-phases, each halt-and-report
**Acceptance**: Every P0 from audit closed; 4 systemic invariants restored

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.B.1 — Production demo data seed (FIRST, ~8-10h)
═══════════════════════════════════════════════════════════

Why first: every subsequent visual review (10.6.B.2-4 and all of 10.6.C)
must be against populated cabinets/dashboards. Empty states all look
the same regardless of which framework rendered them.

Tasks:
   - Verify which org the audit-bot belongs to in production
   - Write scripts/seed-audit-bot-demo.ts:
     * 5 villas across 3 projects
     * 5 owners with ownership_shares linked to audit-bot
     * 10 active bookings (now ± 30 days)
     * 20 sample reviews (mix +/- ratings)
     * 15 maintenance templates + per-villa plans
     * 10 dev_transactions
     * 5 BOQs in various lifecycle states
     * 8 leads + manager_performance_metrics row
     * 12 site_reports with photos + workforce
   - Trigger executive_metrics_daily cron via /development-os/jobs
     (so cabinets show non-empty snapshots)
   - 1 manual run-once per agent (7 connectable agents)
     so agent_outputs has rows
   - Tests verify seed runs idempotently
   - Decisions doc: tmp/stage-10-6-b-1-decisions.md

⛔ Halt + report 10.6.B.1
   Operator visits all 10 cabinets, confirms populated rendering

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.B.2 — Defensive loaders close 13 P0 500s (~10-15h)
═══════════════════════════════════════════════════════════

Per [_p0-500-diagnoses.md](docs/stage-10-6-a-audit/02-dev-os-by-section/_p0-500-diagnoses.md):

Tasks:
   - For each of 5-7 unique loader root causes, apply the defensive
     pattern: return [] instead of throw. Log .warn instead of crashing.
   - Per-loader regression test: "returns empty array when DB query throws"
   - Operator browser-reproduces 1-2 of the 11 errors + pastes Vercel
     log; AI confirms which of the 3 hypotheses fired; lands fix
   - Confirm fix lands all 13 P0 URLs to USABLE
   - Decisions doc

⛔ Halt + report 10.6.B.2
   Operator re-runs production audit; confirms 13 → 0 P0 500s

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.B.3 — AI runner per-org wire-up (~6-12h)
═══════════════════════════════════════════════════════════

Per [_ai-agents-activation-status.md](docs/stage-10-6-a-audit/02-dev-os-by-section/_ai-agents-activation-status.md):

Tasks:
   - Add organizationId to AgentRunArgs interface
   - Cascade through ~20 callsites (greppable)
   - In runAgent(), call loadOrgAgentRuntimeConfig(orgId, agentKey)
   - Compose with global agent_configurations as fallback
   - Use returned provider/model/apiKey via getAIProviderForCredentials()
   - Tests verify per-org config takes precedence
   - Run-once test per cabinet to confirm AI tiles populate
   - Decisions doc

⛔ Halt + report 10.6.B.3
   Operator confirms cabinet AI tiles render populated

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.B.4 — Modal-First shared helper + apply to violators (~26h)
═══════════════════════════════════════════════════════════

Per [_modal-first-scan.md](docs/stage-10-6-a-audit/01-mgmt-os-by-section/_modal-first-scan.md)
+ [_modal-first-scan-devos.md](docs/stage-10-6-a-audit/02-dev-os-by-section/_modal-first-scan-devos.md):

Tasks:
   - Build src/components/ui/modal-first-add.tsx:
     * Props: { addLabel, formComponent, formProps, action, revalidate }
     * Mounts <EntityFormModal>; handles Cancel via setOpen(false)
     * Forwards to /new route as deep-link fallback when opened directly
   - Apply to 43 violators (1 PR per top-level section, 8-10 PRs total)
   - Co-shipped: Cancel-button-as-Button systemic fix on every modal form
     (greppable: cancelHref pattern)
   - Tests verify modal opens, Cancel closes, Save persists, error path
     surfaces inline
   - Decisions doc

⛔ Halt + report 10.6.B.4 = 10.6.B COMPLETE

Phase 10.6.B acceptance:
   ✓ 0 P0 500s in production sweep
   ✓ All 10 cabinets render populated (from 10.6.B.1 seed + 10.6.B.3 AI)
   ✓ Modal-First Add invariant restored on 43 violators
   ✓ Cancel-button-in-modal invariant restored
   ✓ ~50-60 regression tests added
   ✓ Test count: 5606 → ~5660
   ✓ Build clean
```

---

## ═══════════════════════════════════════════════════════════
## Phase 10.6.C — UI/UX modernization prompt seed (~3-4 weeks, ~70-90h)
## ═══════════════════════════════════════════════════════════

```
# Phase 10.6.C — UI/UX modernization
## Stage 10.6 — Quality reset, visual fidelity sub-phase

**Type**: Reference-screenshot vibe applied across cabinets + non-cabinets
**Estimate**: 3-4 weeks (~70-90h)
**Tests target**: ~10-15 (visual snapshot tests; structure tests)
**Migrations**: 0
**Approach**: 3 sub-phases (cabinets → non-cabinets → polish)

PRE-REQUISITE: 10.6.B complete (cabinets must be populated to review
visual fidelity meaningfully).

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.C.1 — Cabinet visual modernization (~2 weeks, ~40h)
═══════════════════════════════════════════════════════════

Reference: 5 attached screenshots from operator (medical/recruitment/
crypto wallet/sales widgets). Distill into 6 design tokens:
   1. Card border-radius: rounded-3xl (24px) NOT rounded-md (8px)
   2. Gradient backgrounds per card (green/orange/dark accent)
   3. Big numbers: 56pt+ for headline KPI (currently 28pt)
   4. Character avatars / illustration accents
   5. Generous outer padding (40px+ section gaps)
   6. Soft drop shadows (currently shadow-flat)

Tasks per cabinet (10 cabinets):
   - Update <DashboardKpi> to support a "premium" variant with the
     6 tokens above (gradient, big-number, soft-shadow)
   - Per-cabinet: replace 4 KPIs to use premium variant
   - Per-cabinet: hero greeting refresh (larger title, subtitle copy)
   - Per-cabinet: side panel character imagery / iconography
   - Mobile spot-check (cabinets stay clean per CHECKPOINT 4 finding)

Effort: ~4h per cabinet × 10 cabinets = ~40h.

⛔ Halt + report 10.6.C.1

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.C.2 — Non-cabinet hub modernization (~1 week, ~20h)
═══════════════════════════════════════════════════════════

Apply the cabinet pattern to high-value non-cabinet hubs:
   - /dashboard (Mgmt OS root)
   - /dashboard/villas — KPI hero (occupancy, revenue MTD, available nights, pending issues)
   - /dashboard/villa-guides/wifi — security KPI hero
   - /dashboard/maintenance-intelligence/plans — overdue count hero
   - /development-os (Dev OS root)
   - /dashboard/operations
   - /dashboard/finance

⛔ Halt + report 10.6.C.2

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.C.3 — Polish + remediation (~1 week, ~10-30h)
═══════════════════════════════════════════════════════════

Tasks:
   - 4 mobile horizontal-overflow fixes (P2-4): /sign-up,
     /development-os/sales, /development-os/ai-agents, /dashboard/notifications
   - Marketing-page hero typography (P2-5)
   - <RowActionsMenu> adoption on remaining list pages (P2-7, partial)
   - Cross-cabinet consistency review post-modernization

⛔ Halt + report 10.6.C.3 = 10.6.C COMPLETE
```

---

## ═══════════════════════════════════════════════════════════
## Phase 10.6.D — Integrations + AI prompt seed (~2 weeks, ~32-50h)
## ═══════════════════════════════════════════════════════════

```
# Phase 10.6.D — Integrations + AI
## Stage 10.6 — Quality reset, integration parity sub-phase

**Type**: 5 priority integrations reach Stage 10.5.B parity
**Estimate**: 2 weeks (~32-50h)
**Tests target**: ~30
**Migrations**: 1-2 (per-org config schemas for new integrations)

PRE-REQUISITE: 10.6.B.3 (AI runner per-org wire-up) shipped.

Per [integration-completeness.md](docs/stage-10-6-a-audit/05-cross-cutting/integration-completeness.md):

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.D.1 — Stripe per-org config (~6-10h)
═══════════════════════════════════════════════════════════
   - Per-org Stripe Connect or direct API key (encrypted via
     existing crypto helper)
   - Test connection flow (call Stripe accounts.retrieve)
   - Status indicator: connected / pending verification / error

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.D.2 — WhatsApp + email + channels (~12-15h)
═══════════════════════════════════════════════════════════
   - WhatsApp: per-org provider (Twilio/Meta) + key + test
   - Email: per-org Resend/SendGrid/Postmark + from-domain + test
   - Channels: fix "cannot add channel" + per-channel OAuth test
     (Booking.com, Airbnb, Vrbo)

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.D.3 — Google Workspace (~4-6h)
═══════════════════════════════════════════════════════════
   - Fix the P0 500 (covered by 10.6.B.2 defensive loader)
   - Surface OAuth-not-configured state cleanly
   - Test connection flow

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.D.4 — Monthly AI usage report per org (~6-8h)
═══════════════════════════════════════════════════════════
   - Stage 10.5.B carry-over: per-org token + cost summary
   - Add organization_id to agent_invocation_log
   - Per-org aggregate query in ai-usage.ts
   - Report surface at /dashboard/settings/ai-agents footer

⛔ Halt + report 10.6.D = 10.6.D COMPLETE
```

---

## ═══════════════════════════════════════════════════════════
## Phase 10.6.E — SubscriptionOS prompt seed (~2 weeks, ~52h)
## ═══════════════════════════════════════════════════════════

```
# Phase 10.6.E — SubscriptionOS
## Stage 10.6 — Quality reset, platform-owner UI sub-phase

**Type**: New /admin route group for platform-owner perspective
**Estimate**: 2 weeks (~52h)
**Tests target**: ~25
**Migrations**: 0-1 (comp_until column on org_subscriptions if needed)

PRE-REQUISITE:
   ✓ 10.6.B.2 (5 platform-side P0 500s fixed)
   ✓ Stripe end-to-end confirmed (1 successful checkout in production)
   ✓ dev_os_usage_metrics cron confirmed running

Per [subscription-os-gap.md](docs/stage-10-6-a-audit/05-cross-cutting/subscription-os-gap.md):

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.E.1 — (admin) layout + auth gate (~4h)
═══════════════════════════════════════════════════════════
   - New role: platform_admin
   - New permission: subscriptionos.read + subscriptionos.write
   - New route group: src/app/(admin)/admin/
   - layout.tsx calls enforcePlatformAdmin()
   - Redirect from /development-os/platform/* → /admin/*
   - Tests verify gating

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.E.2 — Revenue dashboard (~8h)
═══════════════════════════════════════════════════════════
   - /admin/page.tsx (PageHeaderHero + 4 DashboardKpi)
   - KPIs: MRR, ARR, trial-to-paid conversion %, churn rate
   - Body: chart placeholder (sparkline using Stage 10 primitive)
   - Side: top-3 customer expansion / churn-risk shortcuts

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.E.3 — Customer drill-down (~12h)
═══════════════════════════════════════════════════════════
   - /admin/customers/page.tsx — sortable table of all orgs
   - /admin/customers/[code]/page.tsx — per-customer detail:
     * Plan tier, billing status, MRR, lifetime value, last invoice
     * Integrations connected (matrix from 10.6.D state)
     * AI agents enabled (from org_ai_agent_config)
     * Usage metrics (from dev_os_usage_metrics)
     * Activity timeline (auth events, lifecycle events)

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.E.4 — Subscriptions + trials (~12h)
═══════════════════════════════════════════════════════════
   - /admin/subscriptions/page.tsx — lifecycle FSM view
   - /admin/subscriptions/[id]/page.tsx — per-sub detail
   - /admin/trials/page.tsx — funnel + conversion + at-risk
   - /admin/trials/conversions/page.tsx — historical cohorts

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.E.5 — Comps + Stripe reconcile (~10h)
═══════════════════════════════════════════════════════════
   - /admin/comps/page.tsx — issue per-customer plan upgrades
     (migration: org_subscriptions.comp_until + override fields)
   - /admin/stripe/page.tsx — Stripe customer search
   - Reconcile UI: link Stripe customer ID to Arconique org

═══════════════════════════════════════════════════════════
SUB-PHASE 10.6.E.6 — Tests + decisions (~6h)
═══════════════════════════════════════════════════════════
   - ~25 acceptance tests (auth gate + each surface contract)
   - Decisions doc: scope cuts, multi-currency MRR question,
     subdomain-vs-/admin decision

⛔ Halt + report 10.6.E = 10.6.E COMPLETE
```

---

## ═══════════════════════════════════════════════════════════
## Phase 10.6.F — Business-logic deep work prompt seed (~3 weeks, ~60-90h)
## ═══════════════════════════════════════════════════════════

```
# Phase 10.6.F — Business-logic deep work
## Stage 10.6 — Quality reset, deep-domain sub-phase

**Type**: Operator-triaged top 8 of 20 business-logic questions
**Estimate**: 3 weeks (~60-90h)
**Tests target**: ~30-40
**Migrations**: 0-3 depending on which 8 selected

PRE-REQUISITE: operator triage at CHECKPOINT 5 review picks the 8.

20 question stubs in [_business-logic-questions.md](docs/stage-10-6-a-audit/01-mgmt-os-by-section/_business-logic-questions.md).

Recommended top-8 (high customer impact):
   1. Q7  — Concierge AI end-to-end wiring (also closes P0-15)
   2. Q15 — Risk feed scan repair (closes P1-17)
   3. Q12 — Equivalence groups configuration UX
   4. Q13 — Owner stay finance bridge ledger trace UI
   5. Q14 — Maintenance window suggestion algorithm doc + override UX
   6. Q18 — Dynamic pricing rule engine docs + tester surface
   7. Q11 — Owner stay policies fields + editor UX
   8. Q19 — Guest journey rule-builder UX + dry-run

Each becomes its own sub-phase with halt-and-report. Effort range
~6-15h per question depending on depth.

Lower-priority (defer past 10.6 or fold into 10.6.F if budget
remains):
   - Q1 (calendar feed sync UX consolidation)
   - Q2 (service order FSM + bridges)
   - Q3 (financial bridge transaction trace)
   - Q4 (security events timeline)
   - Q5 (verifications)
   - Q6 (Wi-Fi migration docs)
   - Q8 (AI handoffs SLA)
   - Q9 (attachment storage metric labels)
   - Q10 (owner stays request approval workflow)
   - Q16 (front-office workflow handoff)
   - Q17 (direct vs channel bookings comparison)
   - Q20 (vendor scorecard)

PLUS: 9 lower-priority integrations (P3-6) reach Stage 10.5.B parity:
Maps, SMS, Analytics, Banking, Marketing connections, outgoing
webhooks, inbound API keys, Document storage, OAuth providers.

PLUS: /development-os/quantity-surveying decision (P3-2):
build full QS-rollup OR remove placeholder + redirect to /boq.

PLUS: Phase 10.5.C scope (a11y + Lighthouse + iOS Safari real-device)
optionally rolls into 10.6.F polish window.

⛔ Halt + report per sub-phase. Final 10.6.F COMPLETE = customer
launch ready.
```

---

## Phase 10.6 acceptance gate (full)

After 10.6.B + 10.6.C + 10.6.D + 10.6.E + 10.6.F COMPLETE:

| Check | Target | Source |
|---|---|---|
| 0 P0 500s in production | yes | re-run audit harness |
| All 10 cabinets render populated | yes | visual review |
| Modal-First Add invariant restored | yes | re-run scan |
| Cancel-button invariant restored | yes | grep |
| All 9 AI agents activatable per-org | yes | manual config + run-once test |
| Concierge AI end-to-end (P0-15) | yes | guest-side test message |
| 5 priority integrations at 10.5.B parity | yes | matrix re-audit |
| /admin SubscriptionOS MVP shipped | yes | platform-admin walk-through |
| Top 8 business-logic questions resolved | yes | per-Q acceptance |
| Mobile responsive (≤4 P2 overflow remediated) | yes | re-run mobile sweep |
| Tests | ~5606 → ~5800 (+~200) | suite run |
| Build clean | yes | npm run build |
| Cron 104/103 stable | yes | check:cron |

---

## What happens after Phase 10.6 closes

The platform is **customer-launch ready**. Operator can:
- Onboard first paying customer (Stage 11 trial → conversion path)
- Start SubscriptionOS-driven growth (per-customer revenue tracking)
- Monitor production via the (admin) revenue dashboard
- Iterate on lower-priority items (remaining 12 business questions,
  9 lower-priority integrations, accessibility polish) as
  customer-feedback prioritises them

This audit's purpose was to **establish the honest baseline**. Phase
10.6.B-F closes the gap. Stage 11+ resumes feature-forward work
against a known-good production baseline.
