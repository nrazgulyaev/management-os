# FC-DEVELOPMENT-PROJECTS — Projects + PM

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/01-projects.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/01-projects.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Projects + PM — `/development-os/projects` |
| **Pixel truth** | `cc-pixel-prompts/development/01-projects.md` |
| **Cross-surface partners** | BOQ + QS · CFO · Investors |
| **Tables** | `projects` · `boq_lines` · `change_orders` · `milestones` · `permits` · `risks` · `schedule_tasks` · `work_packages` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Projects list | all dev projects | [core] | Have/verify |
| 2 | Project hub [slug] | overview of one project | [detail] | Build/verify |
| 3 | BOQ per project | boq + [lineId] | [cross] | Wire |
| 4 | Change orders | list + [code] + new |  | Have/verify |
| 5 | Company / org chart | company + [id] |  | Have/verify |
| 6 | Decisions log | decisions + [code] + new |  | Have/verify |
| 7 | Land + acquisition | land page |  | Have/verify |
| 8 | Milestones | milestone editor | [cross] | Wire |
| 9 | Permits | permits + [id] |  | Have/verify |
| 10 | Risks | risks + heatmap + [code] + new |  | Have/verify |
| 11 | Schedule | schedule + lookahead + tasks |  | Have/verify |
| 12 | Waterfall | waterfall + simulator | [cross] | Wire |
| 13 | Work packages | WP list + [code] + new |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### BOQ per project
- **Trigger:** boq + [lineId] (`/development-os/projects`)
- **Partner surface:** BOQ + QS
- **Event → effect:** project BOQ feeds the QS cabinet.

### Milestones
- **Trigger:** milestone editor (`/development-os/projects`)
- **Partner surface:** CFO
- **Event → effect:** milestone completion can trigger a capital call / invoice.

### Waterfall
- **Trigger:** waterfall + simulator (`/development-os/projects`)
- **Partner surface:** Investors
- **Event → effect:** distribution waterfall shared with investor cabinet.

## Acceptance (behavioral)

- [ ] BOQ per project: do the action on `/development-os/projects` → assert the effect on BOQ + QS with no manual refresh.
- [ ] Milestones: do the action on `/development-os/projects` → assert the effect on CFO with no manual refresh.
- [ ] Waterfall: do the action on `/development-os/projects` → assert the effect on Investors with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
