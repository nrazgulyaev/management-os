# Stage 10.6.A — Comprehensive Quality Audit

**Status**: 🟡 IN PROGRESS — CHECKPOINT 1 (audit harness + 5 sample pages)
**Scope**: ~200 pages across Mgmt OS / Dev OS / Owner portal / Public / Cabinets
**Approach**: 5 mandatory checkpoints with operator review at each
**No fixes during audit** — documentation only

---

## Why this audit exists

Operator manual walk through production found ~15 broken or missing
features that contradict prior AI-coder "shipped" reports. This audit
is the trust reset:

- Verify every page against actual user-facing behavior, not just
  "tests pass" or "page loads".
- Honest baseline so Phase 10.6.B-F prioritisation is data-driven.
- Comparison to 3 reference screenshots (medical / recruitment /
  crypto wallet / sales widgets) for the modern UI/UX vibe.

---

## Directory structure

```
docs/stage-10-6-a-audit/
├── README.md                              ← you are here
├── 00-executive-summary.md                ← top-line numbers + recommendations
├── 01-mgmt-os-by-section/                 ← per-section reports (~20 files)
│   ├── _per-page-report-template.md       ← canonical format
│   ├── projects.md
│   ├── villas.md
│   ├── villa-guides-wifi.md
│   ├── maintenance-intelligence-plans.md
│   └── ... (one file per top-level section)
├── 02-dev-os-by-section/                  ← per-section reports (~15 files)
├── 03-owner-portal.md                     ← /owner/* surfaces
├── 04-public-surfaces.md                  ← /, /pricing, /signup, etc.
├── 05-cross-cutting/
│   ├── mobile-responsiveness.md
│   ├── modal-vs-page-pattern.md
│   ├── demo-data-quality.md
│   ├── integration-completeness.md
│   ├── ai-agent-status.md
│   └── ui-modernization-gap.md
├── 06-issues-by-severity.md               ← P0 / P1 / P2 / P3 ranked
└── 07-fix-priority-recommendations.md     ← Phase 10.6.B-F sub-task lists
```

Per-section files contain one or more per-page reports following the
canonical format in
[`01-mgmt-os-by-section/_per-page-report-template.md`](01-mgmt-os-by-section/_per-page-report-template.md).

---

## Methodology — three signals per page

For each of ~200 pages we combine three signals:

| Signal | What it catches | What it misses |
|---|---|---|
| **Production navigation** (Playwright headless against `https://management-os-fawn.vercel.app`) | Page-load 4xx/5xx, console errors, network errors, redirect-to-login, page title, presence of h1/main/table/form/CTA buttons | Whether modals open, forms submit, deletes work, cancel buttons close |
| **File-based source analysis** (read `page.tsx` + per-row action components) | Modal vs `/new` pattern, missing Delete affordance, Cancel button as `<Link>` (broken inside modal), pre-fill behavior | Runtime bugs (server errors, permission denials, decryption failures) |
| **Operator-supplied behaviors** (the 15 P0 reports + the 20 questions) | Subjective UI/UX vibe match, business-logic gaps, integration completeness, demo-data quality | Things the operator hasn't tried |

The **production navigation** signal is shipped via the existing
`scripts/audit-production-pages.ts` harness (Stage 7.G) — its JSON output
becomes the raw substrate for each per-page report. Two of the three
signals (file-based + operator-supplied) are documented manually per page
in this directory.

A previous authed run (May 8) already covered 234 URLs with 16 BROKEN
verdicts. **That sweep is shallow** — most of the operator's 15 reported
P0s scored "USABLE" because the page loaded, even though the per-row
Delete or Cancel button behaviour was broken. The richer per-page report
format below addresses that gap.

---

## Verdict scale (per page)

🔴 **Broken** — hard failure: 5xx server error, 404 on a route that should exist, or a feature the operator hit that doesn't work end-to-end.

🟡 **Half-built** — page loads but a primary action is missing or broken (e.g., Edit works, Delete missing; Add navigates to `/new` but the Modal-First Add pattern requires a modal).

🟢 **Working** — page loads, all advertised actions work, no console errors, demo data present.

🆕 **Empty** — page loads but is a placeholder or has zero demo data.

---

## Severity scale (per issue)

- **P0** — blocks customer use of the product. Cannot defer past 10.6.B.
- **P1** — major UX issue or missing core action. Phase 10.6.B-C target.
- **P2** — minor inconsistency or low-frequency edge case. Phase 10.6.D-F target.
- **P3** — polish (typography, spacing, copy). Last-mile work.

---

## Checkpoints

| # | Day | Deliverable | Status |
|---|---|---|---|
| 1 | Day 1 | Audit harness + format demo on 5 sample pages | ✅ this commit |
| 2 | Day 3 | Mgmt OS audit complete (~100 pages) | ⏳ |
| 3 | Day 5 | Dev OS audit complete (~80 pages) | ⏳ |
| 4 | Day 6 | Cross-cutting + integrations + SubscriptionOS gap | ⏳ |
| 5 | Day 7 | Executive summary + ranked fix list + Phase 10.6.B-F prompts | ⏳ |

Each checkpoint halts for operator review before the next launches.
