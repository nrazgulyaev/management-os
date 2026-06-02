# FC-MANAGEMENT-CONCIERGE — Concierge

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/08-concierge.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/08-concierge.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Concierge — `/dashboard/concierge` |
| **Pixel truth** | `cc-pixel-prompts/management/08-concierge.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | `guest_ai_concierge_sessions` · `concierge_escalations` · `comp_offered` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Concierge inbox | active guest sessions ranked by attention | [core] | Have/verify |
| 2 | Comp policy | 500k IDR threshold + approval ladder |  | Have/verify |
| 3 | URGENT escalation | 30-min unresponsive → escalate |  | Have/verify |
| 4 | AI handoff | concierge_handoff routes routine vs issue | [ai] | Build/verify |
| 5 | Comp ledger | comp_offered per booking (audit trail) | [design-only] | Build |
| 6 | Escalation log | concierge_escalations event audit | [design-only] | Build |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
