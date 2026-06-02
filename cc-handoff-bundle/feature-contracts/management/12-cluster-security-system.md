# FC-MANAGEMENT-SECURITY-SYSTEM — Cluster · Security & System

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/12-cluster-security-system.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/12-cluster-security-system.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Security & System — `/dashboard/security` |
| **Also covers** | jobs · notifications · audit · settings |
| **Pixel truth** | `cc-pixel-prompts/management/12-cluster-security-system.md` |
| **Cross-surface partners** | Platform Admin |
| **Tables** | `security_incidents` · `job_runs` · `notifications` · `audit_log` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Security overview | incidents · camera health · patrols · auth events | [core] | Have/verify |
| 2 | Auth-event cadence chart | 7-day bar + critical count |  | Have/verify |
| 3 | Camera registry | registry only (no streaming) |  | Have/verify |
| 4 | Security copilot | overnight incident brief | [ai] | Build/verify |
| 5 | Job definitions (cron) | catalog + enable/disable + run-now |  | Have/verify |
| 6 | Job runs log | status, duration, summary |  | Have/verify |
| 7 | Notification inbox | queued/sent/failed envelopes (idempotent) |  | Have/verify |
| 8 | Audit log | append-only, actor/action/entity/before-after |  | Have/verify |
| 9 | Settings · config health | DB/auth/service-role/mode status |  | Have/verify |
| 10 | Settings · session + users | identity, roles, manage users |  | Have/verify |
| 11 | Settings · subscription | plan, Stripe portal, change plan | [cross] | Wire |
| 12 | System health | /dashboard/system/health |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Settings · subscription
- **Trigger:** plan, Stripe portal, change plan (`/dashboard/security`)
- **Partner surface:** Platform Admin
- **Event → effect:** plan changes reflect in the platform org view.

## Acceptance (behavioral)

- [ ] Settings · subscription: do the action on `/dashboard/security` → assert the effect on Platform Admin with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
