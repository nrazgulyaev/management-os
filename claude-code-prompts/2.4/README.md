# Phase 2.4 — Mgmt P2 + Dev P2 cabinets · Claude Code prompts

Paste-ready PR prompts for implementing Phase 2.4 cabinets in `nrazgulyaev/management-os`.

## How to use

Drop this whole folder into the repo at `.claude/prompts/2.4/` (or wherever your Claude Code workspace expects prompts). Then tell Claude Code:

> Read `claude-code-prompts/2.4/00-seed-cabinets.md` and execute. When done, report back.

After PR 0 (seed) merges, Mgmt-P2 and Dev-P2 tracks can ship in parallel — different file trees, no conflict.

## Order

| # | File | Cabinet | Notes |
|---|---|---|---|
| 0 | `00-seed-cabinets.md` | Seed: 5 primitives + 8 HTML docs | New CSS module + 5 component files + spec docs |
| 1 | `mgmt-01-channels.md` | Mgmt · Channels + Direct bookings | **CRITICAL.** ChannelGrid · OTA sync state machine · conflict modal · channel-listing-matcher |
| 2 | `mgmt-02-dynamic-pricing.md` | Mgmt · Dynamic pricing | PricingCurve · pricing-rules engine · comp-set scraper · pricing-narrator agent |
| 3 | `mgmt-03-front-office.md` | Mgmt · Front office | 3-column today board · check-in 4-step flow · ID OCR · visa watcher |
| 4 | `mgmt-04-concierge.md` | Mgmt · Concierge / Guest stays | Inbox + threads · concierge-agent (autonomous routine asks) · comp-policy-checker · journey-curator |
| 5 | `dev-01-site-supervisor.md` | Dev · Site supervisor + reports | StoryboardLog · 30s mobile capture (PWA) · incident-classifier · weekly-composer |
| 6 | `dev-02-sales.md` | Dev · Sales + Buyers + Contracts | PipelineBoard · 5-lane kanban · contract flow + payment ladder · lead-scorer |
| 7 | `dev-03-investors.md` | Dev · Investors + Distributions | WaterfallChart · 4-step distribution flow · capital call modal · waterfall-calculator |

## Pre-requisites (verify before PR 0)

- Phase 2.0, 2.0.5, 2.1, 2.2, 2.3 all on main
- `src/components/dashboard/detail/` has 8 brick files
- `src/components/ui/modal.tsx` exports `Modal/ConfirmModal/DestructiveConfirmModal`
- `src/components/dashboard/list-page.tsx` + `filter-bar.tsx` + `facet-panel.tsx` exist
- `src/components/command-palette.tsx` exists
- `@dnd-kit/sortable` already in deps (added in 2.2 ops cabinet)
- `@tanstack/react-virtual` already in deps (2.2 BOQ)
- `recharts` already in deps

## Pattern per cabinet PR

Each prompt has:
1. **Reference doc** — path to `_handoff/cabinets/<product-p2>/<cabinet>.html` (pixel-spec)
2. **Files to create / refactor** — exact list
3. **Schema migrations** — new tables, indexes, FKs (included this phase — no deferred data-wiring PR)
4. **Wiring example** — composition with existing primitives
5. **Validation** — typecheck/lint/smoke + visual checks
6. **Commit message**

Inside each PR, Claude Code opens the cabinet HTML and copies exact pixel values from inline `<style>` + the spec table.

## New deps for this phase

| Dep | Used in | Why |
|---|---|---|
| `framer-motion` (already exists) | ChannelGrid drag-select, PipelineBoard drag, WaterfallChart hover-explain | smooth motion on interactive surfaces |
| `react-zoom-pan-pinch` | StoryboardLog lightbox | photo zoom on detail |
| `mapbox-gl` (only if not present) | Site reports map overlay (optional) | gps photos plotted on plan view |

If a dep is already present, this phase doesn't re-pin it — Claude Code reads `package.json` first.

## After all 8 PRs merge

Tell the design-project agent: "Phase 2.4 done." It will update `CLAUDE.md` + `phase-2-scope-lock.md` and start designing Phase 2.5 (Platform super-admin).
