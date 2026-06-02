# FC-DEVELOPMENT-DEV-OPS — Cluster · Dev Ops

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/11-cluster-dev-ops.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/11-cluster-dev-ops.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Dev Ops — `/development-os/marketing` |
| **Also covers** | inbox · project-cycle · productivity |
| **Pixel truth** | `cc-pixel-prompts/development/11-cluster-dev-ops.md` |
| **Cross-surface partners** | Site supervisor · BOQ + QS |
| **Tables** | `marketing_leads` · `dev_inbox_threads` · `productivity_logs` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Marketing pipeline | leads/campaigns/content, 6 channels | [core] | Have/verify |
| 2 | Lead-source attribution | leads/qualified/reservations/CPL per source |  | Have/verify |
| 3 | Content calendar + approval | approval queue, backlog |  | Have/verify |
| 4 | Marketing assistant | captions/hashtags/broadcast | [ai] | Build/verify |
| 5 | Unified inbox | WA/Telegram/IG/Messenger/Email/SMS threads | [core] [mobile] | Have/verify |
| 6 | Inbox templates + auto-responses | reusable replies + rules |  | Have/verify |
| 7 | Thread detail [id] | full conversation | [cross] | Wire |
| 8 | Project-cycle intelligence | "when to start next project" recommendations | [ai] | Build/verify |
| 9 | Capacity tracking | per-role utilization |  | Have/verify |
| 10 | Payroll periods | commitment view |  | Have/verify |
| 11 | Productivity per-trade | hours + quantity → rate (calibrates BOQ) | [cross] | Wire |
| 12 | Productivity log entry | log time + qty |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Thread detail [id]
- **Trigger:** full conversation (`/development-os/marketing`)
- **Partner surface:** Site supervisor
- **Event → effect:** WA messages can draft site reports.

### Productivity per-trade
- **Trigger:** hours + quantity → rate (calibrates BOQ) (`/development-os/marketing`)
- **Partner surface:** BOQ + QS
- **Event → effect:** productivity rates feed BOQ calibration.

## Acceptance (behavioral)

- [ ] Thread detail [id]: do the action on `/development-os/marketing` → assert the effect on Site supervisor with no manual refresh.
- [ ] Productivity per-trade: do the action on `/development-os/marketing` → assert the effect on BOQ + QS with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
