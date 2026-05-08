# Stage 10.A — UX/CRUD Audit

Pure documentation phase. No engineering, no production writes.

## What this directory contains

```
docs/stage-10-audit/
  README.md                            ← you are here
  00-executive-summary.md              ← top findings, suggested phasing
  development-os/
    00-overview.md                     ← module index + verdict counts
    01-command-center.md
    02-cabinets.md
    03-marketing.md
    04-ai-agents.md
    05-executive.md
    06-build-sell.md
    07-sales-buyers.md
    08-capital.md
    09-strategic.md
    10-operations.md
    11-communications.md
    12-roadmap.md
    13-knowledge-base.md
    14-settings.md
    15-platform.md
  management-os/
    00-overview.md
    01-portfolio.md … 27-billing.md    ← 28 module files
  cross-cutting/
    branding.md                        ← Arconique OS umbrella + sub-product naming
    stage-labels.md                    ← all "5.F", "Phase 9.B" leaks
    next-wave-badges.md                ← all "Coming soon", "Next wave"
    crud-completeness.md               ← Add but no Edit/Delete
    modal-vs-page.md                   ← Inline-form Add that should be modal
    empty-states.md                    ← Empty states without CTA
    developer-leaks.md                 ← "npm run db:seed" etc. in operator UI
    role-appropriateness.md            ← RBAC follow-up scope
  patterns-observed/
    good-patterns.md                   ← what works, copy from these
    bad-patterns.md                    ← what's broken
    missing-patterns.md                ← system-wide gaps (ConfirmDialog etc.)
  orphan-urls.md                       ← URLs that didn't match a module spec
```

## How it was generated

1. **`scripts/stage-10-audit.ts`** — Playwright headless browser, authenticated as `audit-bot@arconique.com` (super_admin). Visits each URL in `tmp/stage-10-urls.txt`. For each page captures: HTTP, TTI, console errors, network errors, page title, h1/table/form presence, all visible button text, then runs heuristics for: stage-label leakage, developer-instruction leakage, "next-wave" / "coming soon" badges, empty-state quality, CRUD affordance counts, modal-vs-page Add pattern, confirm-dialog markup, breadcrumbs, branding mentions. Writes `tmp/stage-10-audit-results.json` + screenshots to `tmp/stage-10-screenshots/`.

2. **`scripts/stage-10-synthesize.ts`** — Reads the JSON, groups by module per the operator's Stage 10.A scope, classifies each page severity (BLOCKER / HIGH / MEDIUM / LOW / OK), generates per-module + cross-cutting + patterns docs + executive summary.

Re-run:
```bash
set -a && source .env.audit.local && set +a
npx tsx scripts/stage-10-audit.ts --auth --concurrency=3
npx tsx scripts/stage-10-synthesize.ts
```

## Methodology caveats

- **Read-only.** No clicks on Add/Edit/Delete. No form submissions. No POST to any endpoint.
- **Super-admin only.** All findings reflect what audit-bot sees as super_admin. Non-super-admin views require re-running with each role's credentials (Stage 10.I scope).
- **CRUD heuristic** matches button text `Add/Create/New/Invite/Generate`, `Edit/Rename/Update`, `Delete/Remove/Archive/Revoke/Disable`. **Icon-only buttons without aria-label or visible text are missed** — needs hand verification.
- **Modal-vs-page** counts `a[href$="/new"]` (page) and `button[aria-haspopup="dialog"]` (modal). Mixed-pattern pages tagged ambiguous.
- **Stage label** regex is conservative: `\d+\.[A-N](\.\d+)?`. Some version numbers and section refs may slip through.
- **Dev-leak** patterns include `npm run`, `db:seed`, `tsx scripts/`, `.env.`, `drizzle-kit`, `TODO:`, `FIXME:`. Help docs that legitimately mention CLI commands will flag.
- **Empty-state** detection uses `[data-empty]`, `[class*="empty-state"]`, and `No <X>` text patterns. Custom-styled empties without those markers are missed.

## Severity tags

- **BLOCKER** — broken / missing / 5xx
- **HIGH** — developer leak in UI, OR CRUD entity has Add but no Edit/Delete
- **MEDIUM** — stage label leak, OR next-wave badge, OR Add navigates to /new instead of modal
- **LOW** — slow load, console errors, missing breadcrumb, etc.

## What this audit does NOT do

- Propose specific fixes (operator's Stage 10 master plan is the next phase)
- Suggest new features
- Modify production code
- Submit any forms during walk-through
