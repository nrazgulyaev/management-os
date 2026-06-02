# Phase 2.1 — Universal Templates · Claude Code prompts

Paste-ready PR prompts for implementing Phase 2.1 (Universal Templates) in `nrazgulyaev/management-os`.

## How to use

Drop this whole folder into the repo at `.claude/prompts/2.1/` (or wherever your Claude Code workspace expects prompts). Then tell Claude Code:

> Read `.claude/prompts/2.1/00-seed-templates.md` and execute. When done, report back.

Wait for completion + merge of each PR before moving to the next.

## Order

| # | File | What |
|---|---|---|
| 0 | `00-seed-templates.md` | Copy 9 HTML template files into `_handoff/templates/` as reference material. **Before running**: drag-and-drop those 9 files from the design project (`templates/*.html` + `templates/chrome.css`) into Claude Code's session, or attach them as paths. |
| 1 | `01-foundations.md` | MobileTabbar (HF-12 fix) + EmptyState + Pager (3 variants). ~10 files. |
| 2 | `02-page-templates.md` | List + filter shell + Detail-page bricks (8). The largest PR. ~14 files. May split into 2a/2b. |
| 3 | `03-interactions.md` | Modal (Radix) + ⌘K palette (FlexSearch, new dep). ~10 files. |
| 4 | `04-ai-agent.md` | Catalog refactor + detail with transcript/composer/outputs. ~12 files. |

## Pre-requisites (verify before PR 0)

- Phase 2.0 + 2.0.5 are on main
- `wc -l src/app/globals.css` returns 22
- `ls src/styles/` shows 7 modules
- `src/components/dashboard/primitives.tsx` exports `HandoffBadge` + `Card` with `padding` + `overflowHidden` props
- `grep "display-md" src/styles/typography.css` matches

## After all 5 PRs merge

Tell the design-project agent: "Phase 2.1 done, ready for 2.2." It will update CLAUDE.md status + start designing Mgmt P1 + Dev P1 cabinets.
