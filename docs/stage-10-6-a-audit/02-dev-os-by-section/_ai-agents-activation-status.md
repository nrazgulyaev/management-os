# AI agents activation status — per-agent readiness

9 agents defined in `src/features/ai-agents/agent-config-keys.ts`.
Each has a Dev OS surface at `/development-os/ai-agents/{slug}` which
returned 🟢 USABLE in production. The audit-question is **whether
each agent is actually wired end-to-end** (config + provider + key +
trigger + output), not just whether the page renders.

---

## Activation rubric (per agent)

| Layer | What it means | Where to check |
|---|---|---|
| **Page renders** | UI surface exists | Production sweep verdict |
| **Catalog entry** | `agent_configurations` row exists | DB query |
| **Per-org config** | `org_ai_agent_config` row enables agent for org | DB query |
| **Provider routing** | Agent runner picks the right provider | `agent-runner.ts:140` |
| **Per-org API key** | Org-supplied key (Stage 10.5.B) actually USED at runtime | **CARRY-OVER** — agent-runner doesn't yet read `org_ai_agent_config.api_key_encrypted` |
| **Trigger wired** | "Run now" button POSTs to action | Per-agent page |
| **Output persisted** | `agent_outputs` row created | DB query |
| **Operator visibility** | Output viewable in UI | Per-agent /outputs route |

---

## Per-agent status (file-based + production sweep)

### qs_cost_analyst (Tier 3 — Opus)
- Page: `/development-os/ai-agents/qs-cost-analyst` 🟢 USABLE
- Outputs route: `/development-os/ai-agents/qs-cost-analyst/outputs` 🟢 USABLE
- Cabinet linked: `/development-os/cabinets/qs` (latest output displayed in KPI tile per Stage 10.5.A.2.2)
- Activation gap: per-org provider/key UI shipped (Stage 10.5.B); **runtime integration carry-over** — agent runner uses global `agent_configurations.preferredProvider`, NOT `loadOrgAgentRuntimeConfig()`. So per-org key would NOT take effect even if configured.
- Demo data status: `agent_outputs` likely empty for audit-bot org → cabinet KPI shows "No output yet"

### procurement_analyst (Tier 3 — Opus)
- Page: `/development-os/ai-agents/procurement-analyst` 🟢 USABLE
- Outputs: `/outputs` 🟢
- Cabinet linked: `/development-os/cabinets/procurement-manager`
- Same per-org integration carry-over as above

### tax_assistant (Tier 3 — Opus)
- Page 🟢 USABLE
- Cabinet linked: `/development-os/cabinets/cfo-accountant`
- Same carry-over

### marketing_assistant (Tier 2 — Sonnet)
- Page 🟢 USABLE
- Cabinet linked: `/development-os/cabinets/marketing-staff`
- Same carry-over

### executive_business (Tier 3 — Opus)
- Page 🟢 USABLE
- Cabinet linked: `/development-os/dashboard` (Stage 5.C exec dashboard)
- Same carry-over

### daily_digest (Tier 2 — Sonnet)
- Page 🟢 USABLE
- Cabinet linked: `/development-os/cabinets/project-manager`
- Same carry-over

### weekly_plan (Tier 2 — Sonnet)
- Page 🟢 USABLE
- Cabinet linked: `/development-os/cabinets/project-manager`
- Same carry-over

### inbox (Tier 1 — system surface)
- Page: `/development-os/ai-agents/inbox` 🟢 USABLE
- Not a runnable agent — it's the human-review queue for outputs
  awaiting approval/rejection.

### memory (Tier 1 — system surface)
- Page: `/development-os/ai-agents/memory` 🟢 USABLE
- Not a runnable agent — it's the project-memory editor for things
  agents should "remember" across sessions.

---

## Universal blocker (carry-over from Stage 10.5.B)

The Stage 10.5.B closure explicitly documented this carry-over:

> "Wiring `loadOrgAgentRuntimeConfig()` into `runAgent()` is a small
> refactor that ships in a follow-up sub-phase to keep 10.5.B's scope
> tight."

**This is the blocker.** Until that wire-up ships:
- `org_ai_agent_config.provider` — set but ignored at runtime
- `org_ai_agent_config.api_key_encrypted` — set but ignored at runtime
- `org_ai_agent_config.is_enabled` — checked at UI level only; agent
  runner uses global `agent_configurations.is_active`

For Phase 10.6.D this is a single ~6-12h refactor that unblocks every
agent's per-org configuration. Concrete steps documented in Stage
10.5.B decisions doc:

1. Add `organizationId` to `AgentRunArgs` interface
2. Cascade through every caller (~20 callsites estimated)
3. In `runAgent()`, call `loadOrgAgentRuntimeConfig(orgId, agentKey)`
4. Compose with global agent_configurations as fallback
5. Use returned `provider/model/apiKey` to instantiate provider via
   `getAIProviderForCredentials()` (Stage 10.5.B factory)

---

## Concierge AI (operator-flagged separately)

The Concierge AI agent (Mgmt OS-side, guest-facing) is a separate
codebase from the 9 Dev OS agents. Per operator: "Concierge AI не
подключен". See [`../01-mgmt-os-by-section/concierge-ai.md`](../01-mgmt-os-by-section/concierge-ai.md)
for the Mgmt OS-side P0 finding. The same agent-runner integration
carry-over likely blocks it.

---

## Recommended Phase 10.6.D plan

| Step | Effort | Outcome |
|---|---|---|
| Wire `loadOrgAgentRuntimeConfig()` into `runAgent()` | ~6-12h | All 9 + Concierge agents respect per-org config |
| Seed production demo data (1 sample output per agent) | ~3h | Cabinets show non-empty AI insight tiles |
| Per-cabinet AI connectivity status badge in cabinet UI | ~2h | Operator can see at-a-glance "agent enabled / configured / has key / has output" without leaving the cabinet |
| Monthly AI usage report per org | ~6h (Stage 10.5.B carry-over) | Operator sees cost + token usage per agent per month |

Total Phase 10.6.D AI-integration effort: ~18-25h.
