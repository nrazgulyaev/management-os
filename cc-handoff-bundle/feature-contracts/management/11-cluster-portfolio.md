# FC-MANAGEMENT-PORTFOLIO — Cluster · Portfolio

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/11-cluster-portfolio.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/11-cluster-portfolio.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Portfolio — `/dashboard/villas` |
| **Also covers** | projects · shares |
| **Pixel truth** | `cc-pixel-prompts/management/11-cluster-portfolio.md` |
| **Cross-surface partners** | Development OS · Projects |
| **Tables** | `villas` · `projects` · `ownership_shares` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Villas table | status, model, beds, nightly rate, owner-visible | [core] | Have/verify |
| 2 | Villa detail | per-villa record | [detail] | Build/verify |
| 3 | Add/edit villa | form |  | Have/verify |
| 4 | Projects grid | area, status, concept, villa count |  | Have/verify |
| 5 | Project detail | → dev projects | [cross] | Wire |
| 6 | Ownership shares table | owner, subject, model, share % |  | Have/verify |
| 7 | Allocation totals (=100%) | per villa/pool, over/under flags | [core] | Have/verify |
| 8 | Add share | form + validation |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Project detail
- **Trigger:** → dev projects (`/dashboard/villas`)
- **Partner surface:** Development OS · Projects
- **Event → effect:** links the mgmt project to its dev-side project.

## Acceptance (behavioral)

- [ ] Project detail: do the action on `/dashboard/villas` → assert the effect on Development OS · Projects with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
