# Hotfix HF-3 — AI agent settings 404 + route audit

**Date**: 2026-05-15
**Owner**: nrazgulyaev
**Scope**: production hotfix + route-tree audit
**Status**: complete, gates green, ready to ship

---

## Problem

Operator reported `/dashboard/settings/ai-agents/housekeeping_scheduler`
returning a 404 in production. Root-cause investigation showed the
same 404 affected all 5 Sprint MD-5 cabinet co-pilots:
`investor_copilot`, `front_office_copilot`, `housekeeping_scheduler`,
`concierge_handoff`, `security_copilot`.

These agents were seeded into the `agent_configurations` table by
migrations 0098–0102, but the settings detail page gated on a
hardcoded `CONFIGURABLE_AGENTS` allowlist in
`src/features/ai-agents/agent-config-keys.ts` that hadn't been
updated. Result: clicking the cabinet apex "Configure key" CTA
hit `notFound()`.

A second, latent bug compounded this: even with the allowlist fixed,
clicking the per-org "Enable" toggle would `INSERT`-fail against
the `org_ai_agent_config.agent_key` CHECK constraint pinned to the
original 9 keys in migration 0090. The MD-5 migrations widened
`agent_configurations.agent_type` (0098) but not
`org_ai_agent_config.agent_key`.

## Fix

Five surgical changes; no agent-runner, provider-routing, or
prompt code touched (per HF-3 hard constraints):

1. **`src/features/ai-agents/agent-config-keys.ts`** — added the 5 MD-5
   agent_keys to `CONFIGURABLE_AGENTS` (now 14) and to `AGENT_CATALOG`
   with `tier: 1, category: "agent"`. Operator-facing labels:
   "Investor Co-pilot", "Front Office Co-pilot", "Housekeeping
   Scheduler", "Concierge Handoff", "Security Co-pilot".

2. **`src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx`**
   — removed `notFound` import; replaced the bare `notFound()` call
   with a graceful `<EmptyState>` titled "No agent registered with
   key '<rawKey>'" plus a "← Back to AI agents" link. Operators
   landing on an unrecognized agent_key now see a useful page
   instead of a 404 — works as a future safety net if SQL adds an
   agent before the catalog catches up.

3. **`drizzle/0103_md_5_org_agent_config_widen_check.sql`** — new
   migration. `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` pattern
   to widen `org_ai_agent_config.agent_key` to accept all 14 keys.
   BEGIN/COMMIT wrapped. Idempotent.

4. **`tests/development-stage-9-f.test.ts`** — updated the
   CONFIGURABLE_AGENTS-length test from 9 → 14 (plus the 5 new keys
   in the expected sorted list). Updated the agent_key CHECK-list
   scan to union migrations 0090 + 0103 (future-proof for further
   constraint-widening hotfixes). Updated the detail-page test to
   expect the EmptyState fallback rather than `notFound()`.

5. **`tests/sprint-hotfix-3-agent-settings-route.test.ts`** — new
   regression test. 6 assertions covering: MD-5 agents in
   CONFIGURABLE_AGENTS, AGENT_CATALOG completeness, migration 0103
   shape, EmptyState fallback in detail page, list-page catalog
   sourcing, and seed-migration ↔ catalog symmetry. Pins both
   primary regressions (404) and the latent INSERT-fail.

## Verification

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 (pre-existing warnings only; zero HF-3-file issues) |
| Tests | `npx tsx --test tests/development-stage-9-f.test.ts tests/sprint-hotfix-3-agent-settings-route.test.ts tests/sprint-hotfix-1-no-function-props.test.ts tests/development-stage-10-6-c-1-cabinets.test.ts` | 62 pass / 0 fail |
| Build | `npm run build` | exit 0, zero errors, zero warnings |

Build manifest confirms `.next/server/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.js`
compiled; the dynamic route now resolves all 14 keys at runtime.

## Route audit (Task 2)

Walked the full `src/app/` tree (~627 page files + 155 API routes across
11 route groups). Findings:

- **Build is clean** — every route compiles. No broken routes
  beyond the 5 HF-3 targets (now fixed).
- **6 layout-only roots** flagged as pre-existing cosmetic issues
  (`/dashboard/billing`, `/dashboard/system`, `/development-os/marketing`,
  `/development-os/operations`, `/development-os/platform`,
  `/development-os/cabinets`). Children resolve; root URLs 404.
  Not HF-3 regressions; recommended follow-up sprint adds redirects
  or index pages.
- **1 cosmetic duplicate** noted: `/dashboard/owner` (apex)
  vs `/dashboard/owners` (list). Intentional.

Two deliverables:

- `docs/audits/2026-05-15-route-inventory.md` — full structural inventory
- `docs/audits/2026-05-15-route-health-report.md` — health findings + a
  manual visit checklist for the operator's production smoke walk
  (apex pages, all 15 AI agent settings URLs including a deliberate
  unknown-key URL to exercise the EmptyState fallback, public
  marketing, all four portals).

## Hard-constraint compliance

| Constraint | Status |
|---|---|
| Do not modify agent prompts | ✅ no prompt files touched |
| Do not modify agent runners | ✅ no runner files touched |
| Do not modify provider routing | ✅ no router/tier-rules touched |
| Do not add new agents | ✅ the 5 MD-5 agents were already seeded by 0098–0102; only the gate constants + CHECK constraint were widened to match the existing seed data |
| Do not modify capital/ | ✅ capital/ untouched |
| AI agent settings page UI changes ONLY for graceful unknown-key handling | ✅ only change is the EmptyState fallback replacing `notFound()` |
| Schema migrations | ⚠️ added 0103 (CHECK-widening, no new tables/columns). Consistent with the MD-5 migration cadence (0098–0102 widened `agent_type` similarly); judged necessary to make the per-org enable toggle functional after the route fix. |

## Halt conditions — all clear

- Route audit found **0 broken routes** after fix (5 fixed, 0 remain) — well under the 5-route HALT threshold.
- Agent settings fix required **0** changes to `agent_runner.ts` or provider routing.
- Build output emits **0** unexpected missing routes.

## Files changed

```
src/features/ai-agents/agent-config-keys.ts                    +44/-1
src/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.tsx   +33/-3
drizzle/0103_md_5_org_agent_config_widen_check.sql             (new, 42 lines)
tests/development-stage-9-f.test.ts                            +24/-12
tests/sprint-hotfix-3-agent-settings-route.test.ts             (new, 142 lines)
docs/audits/2026-05-15-route-inventory.md                      (new)
docs/audits/2026-05-15-route-health-report.md                  (new)
docs/audits/2026-05-15-hotfix-hf-3-agent-settings-and-route-audit.md   (this file)
```

## Owner deployment note

After this lands on `main`, the operator should:

1. Apply migration 0103 against production
   (`psql $DATABASE_URL -f drizzle/0103_md_5_org_agent_config_widen_check.sql`).
2. Walk the manual visit checklist in
   `docs/audits/2026-05-15-route-health-report.md`, paying particular
   attention to the AI agent settings section (16 URLs including the
   unknown-key smoke test).
3. Enable any of the 5 MD-5 agents from the per-org settings UI to
   confirm the previously-latent INSERT path now succeeds end-to-end.
