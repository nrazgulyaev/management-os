# FC-OWNER-SETTINGS — Owner Settings

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/owner/07-settings.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/owner/07-settings.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Owner Settings — `/owner/preferences` |
| **Pixel truth** | `cc-pixel-prompts/owner/07-settings.md` |
| **Cross-surface partners** | — (single-surface cabinet) |
| **Tables** | `owner_notification_prefs` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Notification prefs | 6 toggles (owner_notification_prefs 0114) | [core] | Have/verify |
| 2 | Payout edit (2FA-gated) | change payout method behind 2FA | [design-only] | Build |
| 3 | Profile | name, contact |  | Have/verify |

## Acceptance (behavioral)

- [ ] Every `Have/verify` row behaves as written; every `Build` row implemented per its "What it does".
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
