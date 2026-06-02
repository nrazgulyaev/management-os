# Phase 2.3 — Owner Portal P1 · Claude Code prompts

Paste-ready PR prompts for implementing Phase 2.3 (Owner Portal P1) in `nrazgulyaev/management-os`.

## How to use

Drop this folder into the repo (`.claude/prompts/2.3/`). Then tell Claude Code:

> Read `claude-code-prompts/2.3/00-seed-cabinets.md` and execute. When done, report back.

After PR 0 merges, the 7 cabinet PRs are independent — can ship in any order, no conflicts.

## Order

| # | File | Cabinet |
|---|---|---|
| 0 | `00-seed-cabinets.md` | Copy 7 HTML docs to `_handoff/cabinets/owner-p1/` |
| 1 | `owner-01-home.md` | Home / Dashboard · tonality anchor |
| 2 | `owner-02-statement.md` | **Statements** · gold standard · 3-state sign-off |
| 3 | `owner-03-villas.md` | Villas · read-only profile + KPIs |
| 4 | `owner-04-calendar.md` | Calendar · pipeline + personal-stay request |
| 5 | `owner-05-inbox.md` | Inbox · 2-way async messaging |
| 6 | `owner-06-documents.md` | Documents archive |
| 7 | `owner-07-settings.md` | Settings · 2FA-gated payout edit |

## Pre-requisites

- Phase 2.0, 2.0.5, 2.1, 2.2 on main
- New layout group `(owner-portal)` must be created in PR 1 (Home)
- Owner-auth middleware (set `data-product="management"`, gate `role: "owner"`) — covered in PR 1
- Owner subdomain routing in production must be set up separately (`owner.arconique.com`)

## After all 8 PRs

Tell the design-project agent: "Phase 2.3 done." Update CLAUDE.md + phase-2-scope-lock.md.
