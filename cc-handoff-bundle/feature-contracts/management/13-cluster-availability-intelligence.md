# FC-MANAGEMENT-AVAILABILITY-INTELLIGENCE — Cluster · Availability & Intelligence

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/management/13-cluster-availability-intelligence.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/management/13-cluster-availability-intelligence.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Cluster · Availability & Intelligence — `/dashboard/ai` |
| **Also covers** | availability · readiness · digests |
| **Pixel truth** | `cc-pixel-prompts/management/13-cluster-availability-intelligence.md` |
| **Cross-surface partners** | Front office |
| **Tables** | `agent_runs` · `calendar_blocks` · `readiness_timeline` · `digests` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Agent catalog | cards by category, live/planned, runs/24h | [core] [ai] | Build/verify |
| 2 | AI KPIs | live · runs 30d · latency · token spend · refusals | [ai] | Build/verify |
| 3 | AI inbox | cross-agent suggestions needing review | [ai] | Build/verify |
| 4 | Runs audit log | per-invocation status/latency/cost | [ai] | Build/verify |
| 5 | Availability board | master calendar, all block types, half-open |  | Have/verify |
| 6 | Add calendar block | maintenance/clean/OOO/hold |  | Have/verify |
| 7 | Readiness timeline | append-only, current state per villa | [cross] | Wire |
| 8 | Arrivals-not-ready alert | heads-up + risk scan notification | [cross] | Wire |
| 9 | Set readiness | close-then-insert state |  | Have/verify |
| 10 | Daily digests | agent briefs, all/unread, mark-read |  | Have/verify |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Readiness timeline
- **Trigger:** append-only, current state per villa (`/dashboard/ai`)
- **Partner surface:** Front office
- **Event → effect:** readiness drives the arrival gate.

### Arrivals-not-ready alert
- **Trigger:** heads-up + risk scan notification (`/dashboard/ai`)
- **Partner surface:** Front office
- **Event → effect:** emit `availability-intelligence.arrivals_not_ready_alert` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] Readiness timeline: do the action on `/dashboard/ai` → assert the effect on Front office with no manual refresh.
- [ ] Arrivals-not-ready alert: do the action on `/dashboard/ai` → assert the effect on Front office with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
