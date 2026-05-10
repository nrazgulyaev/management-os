# 00 — Executive summary

**Status**: 🟡 SKELETON — populated at CHECKPOINT 5 (Day 7).

This file currently shows the structure operators will receive when the
audit is complete. The sections marked `[populated at CHECKPOINT 5]`
are placeholders that will be filled in once all 200+ pages are walked.

---

## Headline numbers (`[populated at CHECKPOINT 5]`)

| Metric | Count | % of total |
|---|---|---|
| Total pages audited | _ | — |
| 🔴 Broken | _ | _% |
| 🟡 Half-built | _ | _% |
| 🟢 Working | _ | _% |
| 🆕 Empty / placeholder | _ | _% |

| Severity | Count |
|---|---|
| P0 (blocks customer use) | _ |
| P1 (major) | _ |
| P2 (minor) | _ |
| P3 (polish) | _ |

---

## Pattern compliance (`[populated at CHECKPOINT 5]`)

| Pattern | Compliant | Non-compliant |
|---|---|---|
| Modal-First Add (Stage 10.F) — Add opens modal, not `/new` | _ | _ |
| Cancel button closes modal cleanly | _ | _ |
| Per-row Delete / Archive present | _ | _ |
| `<RowActionsMenu>` adopted (Stage 10.D) | _ | _ |
| `<PageHeaderHero>` adopted (Stage 10.D.5) | _ | _ |
| `<DashboardKpi>` for KPI surfaces (Stage 10.B) | _ | _ |
| Mobile responsive (375px width) | _ | _ |
| Reference-screenshot vibe match | _ | _ |
| Demo data present + realistic | _ | _ |

---

## CHECKPOINT 1 finding — the "USABLE" verdict trap

The prior production audit (Stage 7.G, May 8) walked 234 URLs and
returned:
- 216 USABLE (92%)
- 16 BROKEN (mostly Playwright timeouts on a flaky run, not actual server errors)
- 2 DEFERRED

**This count is misleading.** The harness's USABLE verdict only
checks: page loaded, status 200, has h1, no error markers in body.
It does NOT verify:
- Whether the per-row Edit / Delete buttons exist
- Whether modals open or close
- Whether forms submit successfully
- Whether the headline action (e.g., "Generate due tasks") works
- Whether demo data is present
- Whether the layout matches Stage 10.D primitives

**Proof**: every one of the 5 operator-flagged broken pages walked
in CHECKPOINT 1 scored **USABLE (200)** in the prior run. The
operator-flagged P0/P1 issues were all invisible to the harness:

| Page | Prior verdict | CHECKPOINT 1 finding |
|---|---|---|
| `/dashboard/projects` | USABLE | P1 — Modal-First Add violated; `Link href="/projects/new"` |
| `/dashboard/villas` | USABLE | P1 — Edit modal Cancel is `<Link>` that doesn't close modal |
| `/dashboard/villa-guides/wifi` | USABLE | P1 — Delete affordance MISSING, not "broken" |
| `/dashboard/maintenance-intelligence/plans` | USABLE | P0 — "Generate due tasks" server error per operator |
| `/` (homepage) | USABLE | 🟢 P3 — only polish gap (typography vs reference) |

The 4-of-5 false-negative rate confirms the operator's trust
concern: prior "shipped" claims rest on a verdict that doesn't model
real user-facing behavior.

CHECKPOINT 2-4 walks all ~200 pages with the richer per-page format.
Expected outcome: many more 🔴 / 🟡 verdicts than the harness's 16.

---

## Top 20 P0 issues `[populated at CHECKPOINT 5]`

(Ranked list of must-fix-before-customer-launch issues.)

---

## Top 10 quick-win opportunities `[populated at CHECKPOINT 5]`

(Single-file fixes that close multiple issues — e.g., fixing the
`<EntityModal>` Cancel pattern in one component closes Cancel-broken
findings on every modal in the codebase.)

---

## Recommended Phase 10.6.B-F prioritisation `[populated at CHECKPOINT 5]`

### Phase 10.6.B — Critical fixes (~2-3 weeks)
P0 fix list goes here. Initial CHECKPOINT 1 candidates:
- Fix Modal-First Add violation on `/dashboard/projects` and any
  other list pages that regressed.
- Fix Cancel-button-as-`<Link>` systemically across every modal form.
- Implement Delete / Archive on `/dashboard/villa-guides/wifi` and
  every list page where the affordance is missing.
- Reproduce + fix `/dashboard/maintenance-intelligence/plans` "Generate
  due tasks" server error.

### Phase 10.6.C — UI/UX modernization (~3-4 weeks)
Apply Stage 10.5.A cabinet-dashboard pattern to non-cabinet surfaces
where it improves comprehension (Villas KPI hero, Wi-Fi security
hero, Maintenance Plans overdue-counter hero, etc.).

### Phase 10.6.D — Integrations + AI (~2 weeks)
External-service connection UIs + per-agent API key UIs. Stage 10.5.B
shipped the AI agent pattern; replicate it for calendar feeds, payment
providers, channel managers, email services, maps, SMS, document
storage.

### Phase 10.6.E — SubscriptionOS (~2 weeks)
Architecture proposal for the new platform-admin surface (customer
orgs, subscriptions, revenue, per-customer usage). CHECKPOINT 4
documents the gap to current `/dashboard/system` and `/dashboard/platform`
surfaces.

### Phase 10.6.F — Business-logic deep work (~3 weeks)
Owner stay policies, equivalence groups, finance bridges, maintenance
window suggestions, risk-feed scan, concierge AI integration. Each
operator question (20 listed in launch prompt) becomes an investigation
task.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Production credentials gap blocks deep audit | High | High | CHECKPOINT 1 surfaces this — operator must provide audit-bot session OR confirm fall-back to file-based + manual reproduction |
| Audit becomes a 200-page perfectionism trap | Medium | Medium | Hard timebox: ≤3 days for Mgmt OS, ≤1.5 days for Dev OS |
| Operator finds CHECKPOINT 1 sample format too dense or too thin | Low | Medium | Halt-and-report at CHECKPOINT 1 IS this risk's mitigation |
| Findings reveal need for substantial test rewriting | Medium | Low | Out of scope; document in Phase 10.6.B carry-overs |
