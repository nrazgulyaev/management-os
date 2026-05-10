# 00 — Executive summary

**Status**: 🟡 IN PROGRESS — CHECKPOINT 3 (Dev OS audit) shipped 2026-05-10.
**Next**: CHECKPOINT 4 — Cross-cutting (mobile, integrations, SubscriptionOS gap). Does NOT auto-launch; awaits operator review.

---

## CHECKPOINT 3 headline numbers (Dev OS only)

**Total Dev OS URLs audited**: 91 (subset of 234)

**After categorization + 45s-timeout retest**:
- 🟢 USABLE: **79 (87%)**
- 🔴 Confirmed 500 server errors (P0): **11**
- ⏳ DEFERRED: **1** (`/development-os/quantity-surveying` — intentional "coming soon"; the BoQ feature operator asked about ships at `/development-os/boq` and works ✅)
- (53 prior timeouts in main sweep all confirmed USABLE on retest — same harness flakiness pattern as Mgmt OS)

**11 confirmed P0 500s — root-cause estimate**: 5-7 unique fixes (single root causes cascade across paired pages). Each diagnosed against 3 hypotheses in [`02-dev-os-by-section/_p0-500-diagnoses.md`](02-dev-os-by-section/_p0-500-diagnoses.md). **Common fix pattern**: defensive loaders return empty array instead of throwing. Effort: ~10-15h total.

**AI agents activation**: 9 agent pages all 🟢 USABLE. **Universal blocker**: agent-runner integration carry-over from Stage 10.5.B — per-org provider/key not wired into runtime. Single ~6-12h refactor unblocks all 10 cabinets' AI tiles. See [`_ai-agents-activation-status.md`](02-dev-os-by-section/_ai-agents-activation-status.md) + [`_per-cabinet-ai-connectivity.md`](02-dev-os-by-section/_per-cabinet-ai-connectivity.md).

**QS BoQ resolved**: BoQ document management EXISTS and works at `/development-os/boq`. The `/development-os/quantity-surveying` "coming soon" is a separate intentional placeholder for a planned QS-rollup surface. Operator decision needed at 10.6.F: build the rollup OR remove placeholder + redirect to `/boq`.

---

## Combined Mgmt + Dev OS findings (CHECKPOINT 1-3)

| Metric | Mgmt OS | Dev OS | Total |
|---|---|---|---|
| Pages audited | ~234 | 91 | ~270 unique URLs |
| 🟢 USABLE | 220 | 79 | **~299** |
| 🔴 P0 500 | 2 | 11 | **13** |
| ⏳ DEFERRED | 1 | 1 | 2 |
| ⚠️ Operator-flagged behavioral bugs (USABLE-but-broken) | ~17 | additional Modal-First + AI connectivity | ~17+ |
| Modal-First Add violators | ~30 of 48 list pages | ~13 of 16 list pages | **~43 of 64 (~67%)** |

**Single-helper fix sizing for systemic issues**:
- Modal-First Add helper + Cancel-button-as-Button: ~22-26h closes 43 violators + 10-15 modal forms
- Agent-runner integration carry-over: ~6-12h unblocks all 10 cabinets + Concierge AI
- Defensive-loader pattern across 5-7 unique fixes: ~10-15h closes all 13 P0 500s

**Total Phase 10.6.B critical-fix budget**: ~40-55h for the systemic close. Plus per-page operator-flagged behavioral fixes: ~30-50h. Combined: **~70-100h Phase 10.6.B = 2-3 weeks per launch-prompt estimate ✓**.

---

## CHECKPOINT 2 headline numbers (Mgmt OS only)

**Total Mgmt OS URLs audited**: 234 (from `tmp/audit-urls.txt`)

**Production sweep (15s timeout, concurrency 4)** — primary signal:
- 🟢 USABLE: 142 (61%)
- 🔴 BROKEN: 91 (39%)
- 🟡 DEFERRED: 1 (<1%)

**After categorization + 45s-timeout retest** (corrected reality):
- 🟢 USABLE: **220 (94%)** — pages load + render
- 🔴 Confirmed 500 server errors (P0): **13 total** (only **2 in Mgmt OS proper**: `/dashboard/payments/providers` + `/.../new`; the other 11 are Dev OS — see CHECKPOINT 3)
- ⏳ DEFERRED placeholders: 1
- ⚠️ Original 78 BROKEN entries were **all harness flakiness** (15s timeout too aggressive); confirmed via retest.

**The "USABLE" verdict is shallow** — it masks operator-flagged
behavioral bugs that don't surface in HTTP-status checks. CHECKPOINT 1
proved this on 4-of-5 sample pages. CHECKPOINT 2 expanded coverage
across 14 specific operator-flagged surfaces (see "Operator-flagged
behavioral issues" below).

---

## Severity distribution (CHECKPOINT 2 partial; final at CHECKPOINT 5)

| Severity | Count | Notes |
|---|---|---|
| **P0** | 13 confirmed 500s + 4 operator-flagged behavioral bugs | Must fix in Phase 10.6.B. See [`06-issues-by-severity.md`](06-issues-by-severity.md). |
| **P1** | ≥30 Modal-First Add violators + 10-15 Cancel-button-as-Link bugs + 8-10 missing Delete affordances + 1 (Concierge AI not wired) | Phase 10.6.B-C target. |
| **P2** | All 10 cabinets render empty (data seeding gap) + visual fidelity to reference screenshots | Phase 10.6.C visual modernization + 10.6.B data seeding. |
| **P3** | Marketing-page hero typography + per-page polish | Phase 10.6.F or beyond. |

---

## Pattern compliance (Mgmt OS — partial CHECKPOINT 2 sample)

| Pattern | Compliant | Non-compliant | Status |
|---|---|---|---|
| Modal-First Add (Stage 10.F) — Add opens modal, not `/new` | unknown (sample suggests <30%) | ≥30 of 48 list pages | 🔴 — see [`_modal-first-scan.md`](01-mgmt-os-by-section/_modal-first-scan.md) |
| Cancel button closes modal cleanly | unknown | 10-15 forms (estimated from `cancelHref` grep) | 🔴 — covered by Modal-First batch |
| Per-row Delete / Archive present | unknown | confirmed missing on Wi-Fi + maintenance templates; suspected on services catalog | 🟡 — needs CHECKPOINT 3 file inspection |
| `<RowActionsMenu>` adopted | partial | most Mgmt OS list pages still use inline buttons | 🟡 |
| `<PageHeaderHero>` adopted | 1 of 10 cabinets + Front Office | 142 other Mgmt OS pages | 🔴 — Phase 10.6.C |
| `<DashboardKpi>` for KPI surfaces | 10 cabinets + Front Office | most non-cabinet pages | 🔴 — Phase 10.6.C |
| Demo data present + realistic | minimal in production for audit-bot org | most surfaces empty | 🔴 — Phase 10.6.B seed task |
| Reference-screenshot vibe match | none yet | all 10 cabinets + most pages | 🔴 — Phase 10.6.C |

---

## CHECKPOINT 2 trust-gap proof (the audit's existence justifier)

5 sample pages from CHECKPOINT 1 + 14 operator-flagged surfaces from
CHECKPOINT 2 — **every single one scored `USABLE (200)` in the prior
production sweep**. The gap between "harness verdict USABLE" and
"operator says it's broken" is the entire reason this audit exists.

| Page | Prior sweep | Reality |
|---|---|---|
| `/dashboard/projects` | USABLE | P1 — Modal-First Add violated |
| `/dashboard/villas` | USABLE | P1 — Cancel-as-`<Link>` |
| `/dashboard/villa-guides/wifi` | USABLE | P1 — Delete affordance MISSING |
| `/dashboard/maintenance-intelligence/plans` | USABLE | P0 — "Generate due tasks" 500 per operator |
| `/dashboard/bookings` | USABLE | P1 — existing not editable |
| `/dashboard/bookings/calendar` | USABLE | P1 — Modal-First violated |
| `/dashboard/bookings/sync` | USABLE | P1 — sync modals broken |
| `/dashboard/bookings/rates` | USABLE | P1 — Enso Base Rate immutable |
| `/dashboard/integrations/channels` | USABLE | P1 — cannot add channel |
| `/dashboard/guests` | USABLE | P1 — not editable |
| `/dashboard/guest-stays/tokens` | USABLE | P1 — cannot add token |
| `/dashboard/guest-services/catalog` | USABLE | P1 — Delete broken |
| `/dashboard/maintenance-intelligence/templates` | USABLE | P1 — Delete missing |
| `/dashboard/maintenance-intelligence/risk-feed` | USABLE | P1 — scan not working |
| `/dashboard/concierge-ai` | USABLE | P0 — AI not wired end-to-end |
| Owner cabinet | not in sweep | 🟡 renders empty + dense vibe |
| 9 Dev OS cabinets | sweep timeout (15s); USABLE at 45s | 🟡 all render empty |

**False-negative rate on the ~17 known operator-flagged pages: 100%.**

The harness will continue to mislabel these as USABLE until the audit
methodology evolves. CHECKPOINT 1's three-signal approach (production
nav + file-based source analysis + operator-supplied behaviors) is the
fix — and the CHECKPOINT 2 per-section files demonstrate it in action.

---

## CHECKPOINT 2 deliverables shipped today

| File | Purpose |
|---|---|
| `01-mgmt-os-by-section/_per-page-report-template.md` | Full template (CHECKPOINT 1) |
| `01-mgmt-os-by-section/_per-page-report-slim.md` | Slim template for 🟢🆕 (Q2(b)) |
| `01-mgmt-os-by-section/_modal-first-scan.md` | Exhaustive Modal-First Add scan (Q3) |
| `01-mgmt-os-by-section/_cabinets-visual-reaudit.md` | 10-cabinet re-audit + screenshots (Q4) |
| `01-mgmt-os-by-section/_business-logic-questions.md` | 20-question stubs flagged for 10.6.F (Q5(b)) |
| `01-mgmt-os-by-section/_all-other-sections-rollup.md` | Slim rollup of every USABLE Mgmt OS section |
| `01-mgmt-os-by-section/projects.md` | Sample full report (P1 Modal-First) |
| `01-mgmt-os-by-section/villas.md` | Sample full report (P1 Cancel-broken) |
| `01-mgmt-os-by-section/villa-guides-wifi.md` | Sample full report (P1 Delete missing) |
| `01-mgmt-os-by-section/maintenance-intelligence-plans.md` | Sample full report (P0 server error) |
| `01-mgmt-os-by-section/bookings.md` | 4 page reports (operator-flagged) |
| `01-mgmt-os-by-section/payments.md` | 4 page reports incl. 2 confirmed 500s |
| `01-mgmt-os-by-section/guests.md` | 1 page report (operator-flagged) |
| `01-mgmt-os-by-section/guest-stays.md` | tokens broken + 4 slim entries |
| `01-mgmt-os-by-section/guest-services.md` | catalog Delete broken + 3 slim |
| `01-mgmt-os-by-section/maintenance-intelligence.md` | templates + risk-feed + 3 slim |
| `01-mgmt-os-by-section/concierge-ai.md` | P0 AI not wired |
| `04-public-surfaces.md` | 1 sample (`/`) — CHECKPOINT 1 |
| `06-issues-by-severity.md` | Running P0/P1/P2/P3 list |
| `screenshots/cabinets/*.png` | 10 cabinet screenshots, full-page, production |
| `tmp/audit-production-results-checkpoint2.json` | Full sweep results (234 URLs) |
| `tmp/audit-cabinet-retest.json` | Cabinet 45s retest |
| `tmp/audit-timeout-retest.json` | 25 prior-timeout pages confirmed USABLE |

---

## What CHECKPOINT 2 did NOT cover (intentional, per cadence)

- **Dev OS audit** (~80 pages) → CHECKPOINT 3
- **Cross-cutting** (mobile responsiveness sample of 30 pages,
  integration matrix, AI-agent status, SubscriptionOS gap) → CHECKPOINT 4
- **Top 20 P0 ranked list** + Phase 10.6.B-F prompt seeds → CHECKPOINT 5
- **Operator browser-reproduction of the 13 P0 500s** → operator-side
  parallel work; AI-coder will diagnose against the 3-hypothesis
  framework once Vercel logs paste in

---

## Top 20 P0 issues `[populated at CHECKPOINT 5]`

(Will be ranked at CHECKPOINT 5 once Dev OS + cross-cutting audits
add their findings.)

---

## Top 10 quick-win opportunities `[populated at CHECKPOINT 5]`

CHECKPOINT 2 surfaces the candidates:
1. **Single Modal-First Add helper** — closes ≥30 P1 violations in one shared component (~16-22h total work; see `_modal-first-scan.md`).
2. **Cancel-button-as-Button systemic fix** — closes 10-15 modal-form bugs (~3h, co-shipped with helper).
3. **Production demo-data seed task** — makes all 10 cabinets visually verifiable (~6-12h depending on data depth).
4. **`/dashboard/payments/providers` 500 root-cause** — likely fixes both providers + providers/new in one diagnosis (~3h).
5. **`/dashboard/villa-guides/wifi` Delete affordance** — same template applies to maintenance templates + services catalog Delete-missing pattern (~3h × 3 = 9h, or 4h with shared helper).
6. **`audit-urls.txt` regeneration** — closes the `/dashboard/owner` coverage gap (~1h).

---

## Recommended Phase 10.6.B-F prioritisation `[partial — finalised CHECKPOINT 5]`

### Phase 10.6.B — Critical fixes (~3 weeks)
**Headline targets**:
- 13 confirmed 500 server errors (only 2 in Mgmt OS; remaining 11 in Dev OS confirmed at CHECKPOINT 3)
- 14 operator-flagged behavioral bugs (Modal-First batch + Cancel batch + Delete-missing batch + Concierge AI wiring + plans/templates/risk-feed actions + bookings editability + guests editability + token add + channels add)
- Production demo-data seed task

### Phase 10.6.C — UI/UX modernization (~3-4 weeks)
- All 10 cabinets to reference-screenshot vibe (rounded-3xl, gradient cards, big-number KPIs, character imagery)
- Apply cabinet pattern selectively to high-value Mgmt OS list pages
- Marketing-page hero polish

### Phase 10.6.D — Integrations + AI (~2 weeks)
- Stage 10.5.B agent-runner integration (per-org provider/key wired through to runtime — currently a documented carry-over)
- External-service connection UIs (calendar feeds, channels, payment providers, email, maps, SMS) per the launch prompt's integration matrix
- AI-agent monthly usage report (per-org cost summary)

### Phase 10.6.E — SubscriptionOS (~2 weeks)
- Per CHECKPOINT 4 gap analysis (deferred to CHECKPOINT 4)

### Phase 10.6.F — Business-logic deep work (~3-6 weeks)
- 20 questions from `_business-logic-questions.md`, ranked at
  CHECKPOINT 5 by operator priority

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 13 P0 500-error diagnoses blocked on Vercel log access | Medium | High | Operator-side parallel reproduction (Q6 framework — operator pastes log, AI diagnoses) |
| Modal-First fix touches every Mgmt OS list page → big PR | High | Medium | One PR per top-level section (8-10 PRs); shared helper lands first |
| Cabinet visual modernization slips into 10.6.C indefinitely | Medium | Medium | Hard timebox cabinet visual work to ≤2 weeks; escalate if not enough |
| Operator's 7-not-built cabinet finding turns out to be deployment lag (different code on production than commits) | Low | Low | CHECKPOINT 2 cabinet retest + screenshots confirm production matches committed pattern (just empty data) |

---

## ⛔ HALT — CHECKPOINT 3 review before CHECKPOINT 4 launches

Per cadence rule, CHECKPOINT 4 (cross-cutting + integrations +
SubscriptionOS gap) does NOT auto-launch.

Operator should:
1. Browse [`02-dev-os-by-section/`](02-dev-os-by-section/) — confirm format consistency with CHECKPOINT 2 Mgmt OS files.
2. Review [`_p0-500-diagnoses.md`](02-dev-os-by-section/_p0-500-diagnoses.md) — confirm the 11 hypothesis-triples are reasonable; reproduce 1-2 in browser per Q6 + paste Vercel log.
3. Confirm the AI agent activation/connectivity finding (single carry-over from Stage 10.5.B = single ~6-12h fix unblocks all 10 cabinets + Concierge AI).
4. Confirm BoQ resolution (works at `/boq`; `/quantity-surveying` is separate placeholder).
5. Reply **"go 10.6.A.checkpoint-4"** OR with course corrections.

Estimated CHECKPOINT 4 effort: ~1 day for cross-cutting (mobile responsiveness sample of 30 pages + integration matrix + SubscriptionOS gap analysis).
