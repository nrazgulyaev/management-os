# Arconique · Design handoff

This folder is the complete redesign of the Arconique internal product surfaces, packaged for a Claude Code reconciliation pass against the live `management-os` repo.

## Start here
1. **`00-CLAUDE-CODE-PROMPT.md`** — paste this into Claude Code (running in the repo) as the task.
2. **`Design Index.html`** — open in a browser; navigable map of every design file.

## Contents
- `Design Index.html` — master index (links to everything below)
- `design-system.html`, `ds-2.4-primitives.html` — design system / tokens / primitives
- `cabinets/` — all cabinet designs:
  - `mgmt-p1 · mgmt-p2 · mgmt-p3` — Management OS
  - `dev-p1 · dev-p2 · dev-p3` — Development OS
  - `owner-p1` — Owner Portal
  - `super-admin/Platform Console.html` — Platform Admin
  - `new/` — workspace + secondary-surface cabinets
  - `chrome.css`, `p24-primitives.css` — shared tokens (most HTML inline these; kept for reference)
- `auth/Auth Suite.html` — auth suite (6 platforms × 8 screens, clickable)
- `mobile-pass-*.html` — phone variants for every surface
- `feature-inventory/01–04` — **per-cabinet feature checklists** (the analyzable spec; Status column for the diff)
- `feature-gaps/` — design↔code gap audits + ground-truth route/table/agent inventory + coverage map + rollup

## Theme reference
- Management / Owner — warm hospitality · cream + terra · Newsreader
- Development — engineering-grade · sand + amber · Space Grotesk
- Platform — operator console · dark cool-blue · Space Grotesk

## Notes
- The cabinet HTMLs are **static visual specs** (layout, components, copy, states), self-contained (CSS inlined). Open any in a browser.
- The markdown files are the machine-readable extraction + audit trail. Claude Code should read those for the diff and use the HTML for visual/UX reference.
- `feature-gaps/00-rollup.md` carries a STOP banner — parts are stale vs current `main`; the prompt explains how to treat it.
