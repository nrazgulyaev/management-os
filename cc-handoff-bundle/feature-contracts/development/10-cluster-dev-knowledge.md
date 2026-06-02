# FC-DEVELOPMENT-DEV-KNOWLEDGE — Cluster · Knowledge & Docs

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/10-cluster-dev-knowledge.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/10-cluster-dev-knowledge.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Knowledge & Docs — `/development-os/knowledge` |
| **Also covers** | drawings · method-statements · materials |
| **Pixel truth** | `cc-pixel-prompts/development/10-cluster-dev-knowledge.md` |
| **Cross-surface partners** | Procurement |
| **Tables** | `drawings` · `method_statements` · `specs` · `material_pos` · `deliveries` |

## State machine — `method_statement`

`draft` → `review` → `active` → `superseded`

Drawings use Rev A/B…; one IFC per drawing (DB-enforced).

Store state on `method_statement`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Knowledge hub | drawings/specs/methods/quality counts | [core] | Have/verify |
| 2 | Drawing revision control | Rev A/B…, one IFC per drawing |  | Have/verify |
| 3 | Drawing detail [code] | upload revisions | [detail] | Build/verify |
| 4 | Method statements / SOPs | step-by-step, tools/PPE/hazards, JSONB steps |  | Have/verify |
| 5 | Method versioning | draft→review→active→superseded |  | Have/verify |
| 6 | Material POs | vendor POs + reconciliation gate | [cross] | Wire |
| 7 | Deliveries | delivery lines = received gate |  | Have/verify |
| 8 | Specs + quality standards | catalogs |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Material POs
- **Trigger:** vendor POs + reconciliation gate (`/development-os/knowledge`)
- **Partner surface:** Procurement
- **Event → effect:** PO reconciles against delivery.

## Acceptance (behavioral)

- [ ] Only the listed `method_statement` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] Material POs: do the action on `/development-os/knowledge` → assert the effect on Procurement with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
