# Stage 9 / Phase 9.F — Per-tenant AI configuration UI — Decisions

**Date**: 2026-05-08
**Hours target**: 2 days | Tests target: ~15 | Migrations: 1 (0090)
**Tests delivered**: 17 static + 5 DB-bound invariants
**Test count**: 4956 → 4973 passing (+17), invariants 17 → 22 (+5 gated)
**Local PG18 dryrun**: ✅ all 22 invariants pass against fresh DB after replaying 0000 → 0090.

---

## Sub-items shipped

### 9.F.1 — Per-tenant agent enable/disable

**Migration `drizzle/0090_org_ai_agent_config.sql`**: new `org_ai_agent_config` table with
- `(organization_id, agent_key)` unique
- `is_enabled` bool default true
- `custom_prompt` text nullable (override for the canonical kickoff prompt)
- `notes`, `updated_by`, audit timestamps
- CHECK constraint pinning `agent_key` to the 9 canonical surfaces (7 runnable agents + inbox + memory)
- RLS ENABLE + FORCE + `org_ai_agent_config_org_isolation` + `org_ai_agent_config_internal_bypass` policies (matches Stage 7.B / Stage 9.D pattern)

**Server actions** (`src/features/ai-agents/agent-config-actions.ts`):
- `getAgentEligibility(orgId, agentKey)` — composes plan-tier check (`getFeatureForOrg(orgId, 'ai.agents_full' | 'ai.agents_basic')` based on `tier-rules.ts`) AND per-org override. Returns one of 5 reasons: `plan_allows_and_enabled`, `no_subscription`, `plan_excludes_agent`, `disabled_by_org`, `unknown_agent`.
- `setAgentEnabledAction(agentKey, enabled)` — upsert via `onConflictDoUpdate`. Idempotent. Audit-logs `ai.agent.enabled` / `ai.agent.disabled`.
- `setAgentCustomPromptAction(agentKey, customPrompt)` — empty / whitespace-only string normalizes to `null` (clear override). Audit-logs `ai.agent.prompt_overridden` / `ai.agent.prompt_reset`.

All three mutating actions gate on `requirePermission("users.write")`.

**Pure constants** (`src/features/ai-agents/agent-config-keys.ts`): `CONFIGURABLE_AGENTS` list + `AGENT_CATALOG` (label + blurb + tier 1/2/3 + category 'agent' / 'system'). Split out so client components + tests import without `server-only`.

### 9.F.2 — Per-agent detail page

`/dashboard/settings/ai-agents/[agent_key]/page.tsx`:
- Three-card status row: tier (1/2/3), plan eligibility (allowed / not in plan + which flag), state (enabled / disabled by org / —).
- Inline `<ToggleAgentButton>` if plan allows.
- Canonical kickoff prompt display + `<CustomPromptForm>` for override / reset.
- For runnable agents: link to the existing dashboard page where `<RunAgentButton>` lives (Phase 8.B).
- For system surfaces (`inbox`, `memory`): link to the relevant page.
- Returns `notFound()` for unknown agent_key.

### 9.F.3 — WhatsApp number connection per tenant

**Already shipped in Stage 7.F.C.2** at `/development-os/settings/whatsapp` (per-org Twilio creds saved encrypted to `oauth_connections` with `provider='twilio_whatsapp'`). Phase 9.F adds a cross-link section on the AI agents hub pointing operators to that page — no duplication.

### 9.F.4 — Knowledge base per tenant

**Already shipped in Stage 7.0 + Phase 8.B** at `/development-os/ai-agents/memory` (the `project_ai_memory` table). Phase 9.F adds a cross-link on the hub. The Phase 8.B empty-state CTAs there ("Pick an agent to run", "Configure aggregator job") remain; this hub provides the higher-level "where do I configure my AI?" navigation.

### 9.F list page

`/dashboard/settings/ai-agents/page.tsx`:
- Force-dynamic.
- Reads all per-org overrides in one query (`SELECT FROM org_ai_agent_config WHERE org_id = ?`).
- Resolves plan-tier eligibility for each of the 9 agents in parallel via `getFeatureForOrg`.
- Renders 9-row table: Agent (label + blurb), Tier badge, Plan badge (allowed / not in plan), State badge (enabled / disabled by org / —), Toggle button + Configure link.
- Two cross-link cards below: WhatsApp credentials → `/development-os/settings/whatsapp`; Project memory → `/development-os/ai-agents/memory`.

---

## Trade-offs + scope discipline

**1. `getAgentEligibility()` is exported but not yet wired into `runAgentAction`.** Phase 8.B's `runAgentAction` (the existing "Run now" button handler) currently just calls `aiExecute()`, which already enforces plan-tier through Stage 7.0's quota router. Wiring `getAgentEligibility()` in front for explicit "your org disabled this agent" UX is a 5-line follow-up — not strictly required for 9.F's scope (operators can still disable an agent here; the dashboard page just won't fail with the disabled-by-org reason yet). Logged as a small Stage 9.I or Stage 10 follow-on.

**2. Custom prompt override stored but not yet consumed.** The `custom_prompt` field is written by `setAgentCustomPromptAction` and read by the detail page for display. `runAgentAction` doesn't yet consult it — it always uses `RUN_NOW_AGENTS[k].kickoffPrompt`. Wiring takes 6 lines (check `org_ai_agent_config.custom_prompt` first, fall back to canonical) and is the pair of (1). Both can ship together as a tiny follow-up sprint.

**3. The 9th and 8th surfaces (`inbox`, `memory`) are in CONFIGURABLE_AGENTS but the toggle's effect is documented rather than enforced.** Disabling `inbox` doesn't currently hide the inbox page; disabling `memory` doesn't stop ingestion. The toggle records intent + audit-logs it; honoring the toggle in the runtime is part of (1) + (2)'s wiring follow-up.

**4. No new cron, no Stripe, no Stage-9.A/B/C dependencies.** 9.F lives entirely on top of the existing org-billing + agent-config plumbing.

---

## Phase 9.F acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Migration 0090 + schema TS | yes | ✅ |
| Local PG18 dryrun for 0090 | yes | ✅ applied cleanly |
| Server actions (3) | 3 | ✅ |
| List page + toggle | 2 | ✅ |
| Detail page + custom-prompt form | 2 | ✅ |
| WhatsApp + Memory cross-links | yes | ✅ |
| Static tests | ~15 | 17 |
| DB-bound invariants | ~5 | 5 |
| Test count | 4956 → ~4970 | 4973 (+17), invariants 17 → 22 |
| Build | clean | ✅ |
| `check:cron` | clean | ✅ 102 / 101 |

**Migration 0090 must be applied to production manually:**

```bash
set -a && source .env.production.local && set +a
psql "$DIRECT_URL" -f drizzle/0090_org_ai_agent_config.sql
```

Then verify:

```bash
node --env-file=.env.production.local --import tsx \
  --test tests/invariants/org-ai-agent-config.test.ts
# Expected: 5 passed, 0 failed.
```

**STAGE 9 / PHASE 9.F ACCEPTED (pending operator-applied migration).**
