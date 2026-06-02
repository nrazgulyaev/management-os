# FC-MANAGEMENT-DOCUMENTS — Documents

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/15-documents.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/15-documents.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Documents — `/dashboard/documents` |
| **Pixel truth** | `cc-pixel-prompts/management/15-documents.md` |
| **Cross-surface partners** | Owner Portal |
| **Tables** | `documents` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Document vault | grouped docs, visibility | [core] | Have/verify |
| 2 | Bundle generation | owner doc bundles | [cross] | Wire |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Bundle generation
- **Trigger:** owner doc bundles (`/dashboard/documents`)
- **Partner surface:** Owner Portal
- **Event → effect:** emit `documents.bundle_generation` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] Bundle generation: do the action on `/dashboard/documents` → assert the effect on Owner Portal with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
