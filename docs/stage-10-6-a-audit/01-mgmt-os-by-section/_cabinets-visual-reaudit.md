# Cabinet visual re-audit — Stage 10.5.A.1 / .2 / .3 reality check

**Triggered by**: operator finding "Only 10.5.A.1 shipped (3 cabinets:
Owner, CFO, PM). 10.5.A.2 + 10.5.A.3 NOT shipped yet (7 cabinets
remaining). Document 7 remaining cabinets as 🆕 Empty (not built)."

**Production environment**: `https://management-os-fawn.vercel.app`,
authenticated as audit-bot, fresh sweep on 2026-05-10 (CHECKPOINT 2).

---

## Summary

The operator's "7 not built" finding is **partially correct in spirit
but technically inaccurate**. All 10 cabinet pages render successfully
in production (HTTP 200, USABLE verdict at the harness level). The
gap is two-fold:

1. **All 10 cabinets show empty states**, not the demo-data-rich
   versions the reference screenshots imply. From a user perspective,
   an empty cabinet IS effectively "not built" — there's nothing to do.
2. **The visual vibe is dense + neutral**, not the gradient-card +
   big-number + character-imagery treatment of the reference
   screenshots.

So the operator's perception was correct ("look old, look not built")
but the technical reality differs from "code never shipped". The
fix path differs accordingly:

| If operator's interpretation were correct | Actual reality |
|---|---|
| Re-implement 7 cabinets from scratch | Seed demo data + visual polish |
| ~3 weeks per Stage 10.5.A pattern | ~1 week (data seeding) + ~2 weeks (visual modernization) |

---

## Per-cabinet production verdict + screenshot evidence

All 10 retested 2026-05-10 with 45s timeout (the prior 15s timeout
caused harness flakiness; with longer timeout 100% USABLE).

| # | Cabinet | URL | Verdict | Screenshot | Empty? |
|---|---|---|---|---|---|
| 1 | Owner (Mgmt OS) | `/dashboard/owner` | 🟡 Half-built | [`screenshots/cabinets/_dashboard_owner.png`](../screenshots/cabinets/_dashboard_owner.png) | "No villas yet" portfolio + "Nothing pending" alerts |
| 2 | My Cabinet | `/development-os/cabinets/my-cabinet` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_my-cabinet.png) | redirect-only (Stage 6 router) |
| 3 | CFO / Accountant | `/development-os/cabinets/cfo-accountant` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_cfo-accountant.png) | "No snapshots yet" — daily executive metrics cron not run |
| 4 | Project Manager | `/development-os/cabinets/project-manager` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_project-manager.png) | "No active projects yet"; 4 KPIs all zero |
| 5 | QS / Cost Analyst | `/development-os/cabinets/qs` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_qs.png) | needs production verification (sweep marked USABLE; visual review pending) |
| 6 | Procurement Manager | `/development-os/cabinets/procurement-manager` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_procurement-manager.png) | empty state |
| 7 | Marketing Staff | `/development-os/cabinets/marketing-staff` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_marketing-staff.png) | empty state |
| 8 | Sales Manager | `/development-os/cabinets/sales-manager` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_sales-manager.png) | empty state |
| 9 | Warehouse Manager | `/development-os/cabinets/warehouse-manager` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_warehouse-manager.png) | empty state |
| 10 | Site Supervisor | `/development-os/cabinets/site-supervisor` | 🟡 Half-built | [link](../screenshots/cabinets/_development-os_cabinets_site-supervisor.png) | empty state |

**Verdict for the entire batch**: 🟡 Half-built. Pages exist, render
without error, follow the Stage 10.5.A skeleton (PageHeaderHero + 4
DashboardKpi + 2/3-1/3 split body), but are functionally empty.

---

## Visual gap to reference screenshots

The 5 reference screenshots provided (medical doctor / recruitment
pipeline / crypto wallet / sales+forecast / market widgets) share a
visual vocabulary that the production cabinets do NOT match:

| Reference characteristic | Production cabinet (today) |
|---|---|
| Card border-radius `rounded-3xl` (~24px) | `rounded-md` (~8px) |
| Gradient backgrounds (green/orange/dark per card) | Neutral white surface, monochrome border |
| Big numbers ≥56pt for headline KPI | 28pt KPI value (DashboardKpi default) |
| Character avatars / illustration accents | None |
| Generous outer padding (~40px section gaps) | 24-32px (Tailwind `gap-8`) |
| Soft drop shadows | `shadow-flat` only |
| Inline chat / character-led "support" component | None on cabinet pages |

**This is a Phase 10.6.C deliverable**, not a 10.6.B critical fix.
The cabinets are functional skeletons — the visual modernization is
worth doing, but doesn't block customer use. Document the gap;
schedule the upgrade.

---

## Data-seeding gap (Phase 10.6.B candidate)

The empty-state copy on each cabinet points to the data source:

- **CFO**: "The daily executive metrics cron will populate this. Run
  it manually from /development-os/jobs to seed."
- **Project Manager**: "Create a project from /development-os/projects
  to start tracking."
- **Owner**: "When ownership shares are linked to your account, your
  villas will surface here."
- (others similar)

The operator's existing demo-data seed scripts (`scripts/seed.ts`,
`scripts/seed-dev-os.mjs`, `scripts/seed-production-minimal.ts`) run
in the dev environment. **Production has only the audit-bot org with
zero application data.** The CFO cabinet expects
`executive_metrics_snapshots` rows; the PM cabinet expects rows in
`projects` / `qa_qc_issues` / `risk_register`; the Owner cabinet
expects `ownership_shares` linked to the audit-bot user.

**Recommendation**: Phase 10.6.B includes a "demo data seed for
production audit-bot org" task so the cabinets can be reviewed
against rich data, not empty states. This is the only honest way to
visually verify the cabinet pattern — empty states all look the same
regardless of which framework rendered them.

---

## Reconciliation with prior 10.5.A.1-3 commits

The earlier session commits (8725f5b, 9f1c101, d954e87) shipped the
code for all 10 cabinets onto the unified pattern. This re-audit
confirms:

- **The code is deployed**: all 10 URLs return 200 USABLE in production.
- **The code is structurally on the pattern**: PageHeaderHero +
  DashboardKpi + 2/3-1/3 split visible in screenshots.
- **The acceptance gates were met at the codebase level**: tests pass,
  TypeScript clean, build clean, primitives imported correctly.

**What the prior acceptance gates DID NOT verify**:
- Data-rich rendering (cabinets always tested against empty queries
  in node:test; never against seeded data in a real browser)
- Visual fidelity to reference screenshots (the pattern doc's
  threshold conventions are functional, not aesthetic)
- End-to-end "operator opens cabinet, sees useful content"

The operator's "look old / look not built" finding is the natural
result of those acceptance-gate gaps. Phase 10.6.B-C should:
- 10.6.B: seed production demo data so cabinets render with content
- 10.6.C: visual modernization pass against the 5 reference screenshots

---

## What the operator should do at CHECKPOINT 2 review

1. Open each of the 10 screenshots above and confirm the gap analysis.
2. Confirm whether visual modernization (10.6.C) or data seeding
   (10.6.B) is higher priority. Both are needed; sequencing matters.
3. Confirm whether Owner cabinet should be moved into the Mgmt OS
   left-nav menu (operator's prior finding "cabinet dashboards
   direct-link only, not in menu").
