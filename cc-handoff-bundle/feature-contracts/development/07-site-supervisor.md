# FC-DEVELOPMENT-SITE-REPORTS — Site supervisor

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/development/07-site-supervisor.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/development/07-site-supervisor.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Site supervisor — `/development-os/site-reports` |
| **Pixel truth** | `cc-pixel-prompts/development/07-site-supervisor.md` |
| **Cross-surface partners** | Dev Inbox |
| **Tables** | `site_reports` · `site_frames` · `voice_notes` · `weekly_reports` |

## State machine — `incident severity`

`P1` → `P2` → `P3`

Rule-based first-pass classifier; photos without GPS are flagged.

Store state on `incident severity`. Allow only the listed transitions; reject illegal ones at the API layer. Gate side-effects on the transition, not on a render.

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Site report list | daily reports | [core] | Have/verify |
| 2 | Report detail [id] | photos, zones, incidents | [detail] | Build/verify |
| 3 | New report (capture) | camera + caption + tag flow |  | Have/verify |
| 4 | Quick-photo | /operations/site-reports/quick-photo | [mobile] | Have/verify |
| 5 | Severity classifier | P1/P2/P3 rule-based first pass | [ai] | Build/verify |
| 6 | Weekly composer | picks 3 hero frames + drafts summary | [ai] | Build/verify |
| 7 | GPS + timestamp at source | photos without GPS flagged |  | Have/verify |
| 8 | Voice note narration | voice_notes (0105) |  | Have/verify |
| 9 | WhatsApp → site report | WA intent → draft | [cross] | Wire |
| 10 | Weekly report table | design wants weekly_reports + site_frames view | [design-only] | Build |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### WhatsApp → site report
- **Trigger:** WA intent → draft (`/development-os/site-reports`)
- **Partner surface:** Dev Inbox
- **Event → effect:** an inbound WhatsApp message drafts a site report.

## Acceptance (behavioral)

- [ ] Only the listed `incident severity` transitions are reachable; illegal transitions rejected at the API layer.
- [ ] WhatsApp → site report: do the action on `/development-os/site-reports` → assert the effect on Dev Inbox with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
