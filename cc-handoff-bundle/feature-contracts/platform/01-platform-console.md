# FC-PLATFORM-PLATFORM-CONSOLE — Platform super-admin console

> Behavior contract. Read `00-MASTER-CONTRACT.md` first. Pair with pixel prompt `cc-pixel-prompts/platform/01-platform-console.md` (look) and the cabinet's migration (storage).

> ⚠️ **PROVISIONAL (format v2).** Structure & flows are right, but **names and `Status` tags are NOT yet reconciled against `main`.** Before building, run Rule 0 in `00-MASTER-CONTRACT.md`: pull canonical names from `src/lib/db/schema/*.ts`, re-derive every `Have/Wire/Build` against code (cite the file), and add a **Schema** block. See `owner/02-statements.md` for the reconciled gold-standard shape.

## Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- this file (reconcile against `main` first — Rule 0)
- pixel: `cc-pixel-prompts/platform/01-platform-console.md` + its mockup HTML in `cabinets/`
- storage: the cabinet’s `drizzle/00xx` migration(s)

## Header

| | |
|---|---|
| **Primary surface** | Platform super-admin console — `/platform` |
| **Also covers** | organizations · revenue · usage · agents · audit |
| **Pixel truth** | `cc-pixel-prompts/platform/01-platform-console.md` |
| **Cross-surface partners** | All customer surfaces · Dev OS · Customer orgs |
| **Tables** | `organizations` · `platform_agent_configs` · `agent_runs` · `audit_log` |

## Function inventory

| # | Function | What it does | Tags | Status |
|---|---|---|---|---|
| 1 | Org list | all customer orgs, plan, status, MRR, period-ends, products | [core] | Have/verify |
| 2 | Status filter pills | active/trial/grace/cancelled |  | Have/verify |
| 3 | Org detail [orgCode] | per-org subscription state + actions | [detail] | Build/verify |
| 4 | Comp flag | internal-comp orgs |  | Have/verify |
| 5 | Read-only impersonation | "view as customer" | [cross] | Wire |
| 6 | MRR / ARR hero | sum of active monthly price; ×12 | [core] | Have/verify |
| 7 | Per-tier table | active/trial/price/MRR contribution per plan |  | Have/verify |
| 8 | Trial→paid + churn (30d) | indicative conversion + churn % |  | Have/verify |
| 9 | Usage product split | mgmt-only / dev-only / both | [core] | Have/verify |
| 10 | AI usage deep-link | → Dev OS AI usage analytics | [cross] | Wire |
| 11 | Agent registry | platform_agent_configs: provider/model/scope | [core] [ai] | Build/verify |
| 12 | Agent detail [id] | config + knowledge + test-chat | [detail] [ai] | Build/verify |
| 13 | Knowledge base upload | per-agent KB (pgvector) | [ai] | Build/verify |
| 14 | API key via Vault | encrypted at rest, configured/missing badge |  | Have/verify |
| 15 | Org agent subscriptions | enable agent per customer org | [cross] | Wire |
| 16 | Admin audit log | who/when/what/before-after, every operator action | [core] | Have/verify |
| 17 | Users management | platform-user admin | [design-only] | Build |
| 18 | Feature flags | per-org flag toggles | [design-only] | Build |
| 19 | Support inbox | ticket triage (or stay external) | [design-only] | Build |

## Cross-surface flows

Each of these must work **both ends**. Trigger on this cabinet → named event → effect on the partner surface. Build the partner handler if it does not exist.

### Read-only impersonation
- **Trigger:** "view as customer" (`/platform`)
- **Partner surface:** All customer surfaces
- **Event → effect:** impersonation is read-only and audit-logged.

### AI usage deep-link
- **Trigger:** → Dev OS AI usage analytics (`/platform`)
- **Partner surface:** Dev OS
- **Event → effect:** emit `platform-console.ai_usage_deep_link` → partner subscribes and reflects the change with no manual sync.

### Org agent subscriptions
- **Trigger:** enable agent per customer org (`/platform`)
- **Partner surface:** Customer orgs
- **Event → effect:** emit `platform-console.org_agent_subscriptions` → partner subscribes and reflects the change with no manual sync.

## Acceptance (behavioral)

- [ ] Read-only impersonation: do the action on `/platform` → assert the effect on All customer surfaces with no manual refresh.
- [ ] AI usage deep-link: do the action on `/platform` → assert the effect on Dev OS with no manual refresh.
- [ ] Org agent subscriptions: do the action on `/platform` → assert the effect on Customer orgs with no manual refresh.
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## Open questions

- Confirm the canonical event names + payloads for the cross-surface flows above.
- Some rows are `[design-only]` (no backing in `main`) — confirm they are in scope to **Build**.
