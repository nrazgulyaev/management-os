# Phase 2.2 — Mgmt P1 + Dev P1 cabinets · Claude Code prompts

Paste-ready PR prompts for implementing Phase 2.2 cabinets in `nrazgulyaev/management-os`.

## How to use

Drop this whole folder into the repo at `.claude/prompts/2.2/` (or wherever your Claude Code workspace expects prompts). Then tell Claude Code:

> Read `claude-code-prompts/2.2/00-seed-cabinets.md` and execute. When done, report back.

After PR 0 merges, Mgmt and Dev tracks can ship in parallel — different file trees, no conflict.

## Order

| # | File | Cabinet | Notes |
|---|---|---|---|
| 0 | `00-seed-cabinets.md` | Copy 9 HTML cabinet docs into `_handoff/cabinets/` | No code |
| 1 | `mgmt-01-bookings.md` | Mgmt · Bookings | Refactor on 2.1 scaffold + channel pill + today strip + cancel policy |
| 2 | `mgmt-02-finance.md` | Mgmt · Finance/Statements | **Gold standard.** State machine, hash sealing, 3-state detail, approve flow |
| 3 | `mgmt-03-owners.md` | Mgmt · Owners | Tier rings, retention risk model (5 signals), 3-step onboarding lg modal |
| 4 | `mgmt-04-operations.md` | Mgmt · Operations | Command center, SLA model (4 priorities), housekeeping kanban + `@dnd-kit` dep |
| 5 | `dev-01-projects.md` | Dev · Projects + PM | Card-list, milestones panel, RFI queue, 4-step onboarding |
| 6 | `dev-02-cfo.md` | Dev · CFO/Finance | Waterfall, capital-calls, 12mo cashflow forecast |
| 7 | `dev-03-boq-qs.md` | Dev · BOQ + QS | WP-tree + virtualized BOQ + variance review queue + import wizard + `@tanstack/react-virtual` dep |
| 8 | `dev-04-procurement.md` | Dev · Procurement | RFQ list, 3-vendor quote compare, vendor scoring, agent-matcher |

## Pre-requisites (verify before PR 0)

- Phase 2.0, 2.0.5, 2.1 all on main
- `ls src/components/dashboard/detail/` has 8 brick files
- `src/components/ui/modal.tsx` exports `Modal/ConfirmModal/DestructiveConfirmModal`
- `src/components/command-palette.tsx` exists
- `flexsearch` in deps

## Pattern per cabinet PR

Each prompt has:
1. **Reference doc** — path to `_handoff/cabinets/<product-p1>/<cabinet>.html` (pixel-spec)
2. **Files to create / refactor** — exact list
3. **Wiring** — example composition with Phase 2.1 primitives
4. **Validation** — typecheck/lint/smoke + visual checks
5. **Commit message**

Inside each PR, Claude Code opens the cabinet HTML and copies exact pixel values from inline `<style>` + the spec table.

## After all 9 PRs merge

Tell the design-project agent: "Phase 2.2 done." It will update `CLAUDE.md` + `phase-2-scope-lock.md` and start designing Phase 2.3 (Owner Portal P1).
