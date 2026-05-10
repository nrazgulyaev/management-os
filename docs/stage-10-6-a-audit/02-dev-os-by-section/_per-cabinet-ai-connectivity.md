# Per-cabinet AI connectivity check

Each Dev OS cabinet surfaces "latest AI insight" tiles linking to
agent outputs. CHECKPOINT 2 found all 10 cabinets render empty.
CHECKPOINT 3 explains why each cabinet's AI tile is dark.

The connectivity gap is a **single root cause repeating per cabinet**:
the agent-runner integration carry-over from Stage 10.5.B (per-org
provider/key not yet wired into runtime). Plus production has zero
`agent_outputs` rows for the audit-bot org.

---

## Cabinet → Agent → Output mapping

| Cabinet | Linked agent | Cabinet KPI / link | Production state |
|---|---|---|---|
| Owner (Mgmt OS) | _none_ — cabinet uses owner-intelligence health snapshots, not AI | `villaHealthSnapshots` table (DB-driven, not AI) | Empty (no snapshots seeded) |
| My Cabinet | _redirect-only_ (Stage 6 router) | n/a | Redirects to user's primary cabinet |
| CFO / Accountant | `tax_assistant` + `qs_cost_analyst` | "Latest tax assistant" + "Latest QS cost analyst" linked tiles | Both null (agent never run for audit-bot org) |
| Project Manager | `daily_digest` + `weekly_plan` | 2 KPI tiles + memory-items count | Both null |
| QS / Cost Analyst | `qs_cost_analyst` | "Latest analysis" KPI tile | Null |
| Procurement Manager | `procurement_analyst` | "Latest procurement analyst" tile | Null |
| Marketing Staff | `marketing_assistant` | "Latest marketing assistant" tile | Null |
| Sales Manager | _none_ direct — uses `manager_performance_metrics` table | Weekly snapshot section | Null (no metrics seeded) |
| Warehouse Manager | _none_ direct — uses inventory queries | n/a | Inventory empty for audit-bot org |
| Site Supervisor | _none_ direct — uses site_reports + qa_qc tables | n/a | Empty |

---

## Universal blocker chain

For cabinets to display non-empty AI tiles, ALL of these must be true
for the org viewing the cabinet:

1. **Agent enabled per-org** — `org_ai_agent_config.is_enabled = true`
2. **Provider configured per-org** — either env-default OR
   `org_ai_agent_config.provider + api_key_encrypted` set
3. **Agent runner reads per-org config** — ⛔ **CARRY-OVER** from
   Stage 10.5.B; runner currently reads `agent_configurations`
   (global) not `org_ai_agent_config` (per-org)
4. **Agent has been triggered** — either via cron (Stage 5.D
   recurring) or manual "Run now" button per agent page
5. **`agent_outputs` row created** — agent runner writes to the
   table on success
6. **Cabinet query reads recent output** — verified shipped (Stage
   6 cabinet queries pull `output_code` from `agent_outputs WHERE
   agent_key = X ORDER BY created_at DESC LIMIT 1`)

**The chain breaks at step 3 today.** Steps 1-2 ship in the UI
(Stage 10.5.B). Step 4 is per-page button or cron. Steps 5-6 work.
Step 3 is the single fix that unlocks everything.

---

## Phase 10.6.D fix (single-step unblock)

Same fix as documented in
[`_ai-agents-activation-status.md`](_ai-agents-activation-status.md):

1. Wire `loadOrgAgentRuntimeConfig(orgId, agentKey)` into `runAgent()`.
2. Cascade `organizationId` through `AgentRunArgs` (~20 callsites).
3. Compose with global `agent_configurations` as fallback.
4. Use returned `provider/model/apiKey` to instantiate provider via
   `getAIProviderForCredentials()` (Stage 10.5.B factory).

After this lands + 1 trigger of each of the 7 connected agents (cron
or manual), all 10 cabinets show their AI insight tiles populated.

---

## What about Concierge AI?

Mgmt OS-side. See
[`../01-mgmt-os-by-section/concierge-ai.md`](../01-mgmt-os-by-section/concierge-ai.md).
The same agent-runner integration carry-over likely blocks it from
actually invoking the AI agent on guest messages.

---

## Cabinet visual modernization (separate from connectivity)

The connectivity gap is functional. The "look old" gap is visual.
These are two independent problems:

| Problem | Fix sub-phase | Effort |
|---|---|---|
| Cabinet AI tiles empty (connectivity) | 10.6.D | ~6-12h (agent-runner wire-up) + ~3h (seed sample outputs) |
| Cabinet visuals dense vs reference | 10.6.C | ~2-3 weeks (cabinet-by-cabinet visual modernization) |

Phase 10.6.B should ship the agent-runner wire-up FIRST so the visual
modernization in 10.6.C is reviewed against populated cabinets, not
empty ones. Otherwise the visual review is meaningless (you can't
judge a KPI tile's design when the value is always "—").
