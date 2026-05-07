/**
 * Stage 7.0 retrofit — pure tier rules.
 *
 * Maps agent codes (the `agentKey` / `assistantKey` in use across the
 * codebase) to a tier 1/2/3 + provides a tier→model lookup.
 *
 * **Tier philosophy** — derived from real Arconique workload:
 *   - **Tier 1**: classification + routing + simple summarization. Cheap +
 *     fast — happy with Claude Haiku 4.5 / GPT-4o-mini / Gemini 1.5 Flash.
 *   - **Tier 2**: drafting + reasoning over single-domain context — the
 *     bulk of agent traffic. Claude Sonnet 4.6 / GPT-4o / Gemini 1.5 Pro.
 *   - **Tier 3**: multi-domain reasoning, cost analysis, compliance, exec
 *     summaries — small volume, high stakes. Claude Opus 4.7.
 *
 * Pure module — no DB, no `import "server-only"` — testable.
 */

export type AgentTier = 1 | 2 | 3;
export type ProviderName = "anthropic" | "openai" | "gemini" | "dry_run";

/**
 * Canonical agent inventory + tier assignments. Keys match the
 * `agentKey` strings persisted to `agent_invocation_log` (or
 * `assistantKey` strings persisted to `ai_assistant_runs`).
 *
 * Adding a new agent? Add it here. Unknown agent codes default to
 * Tier 2 via `agentCodeToTier()` — but the canonical entry should
 * always exist.
 */
export const AGENT_TIER_MAP: Record<string, AgentTier> = {
  // Tier 1 — classifiers, routers, simple extractions.
  inbox_triage: 1,
  classifier: 1,
  simple_summarizer: 1,
  // Stage 2.2 + Stage 5 era agents.
  document_extraction: 1,

  // Tier 2 — drafting + per-domain reasoning. The bulk.
  "dev_os.sales_assistant": 2,
  marketing_assistant: 2,
  daily_digest: 2,
  weekly_plan: 2,
  memory: 2,
  operations_copilot: 2,
  photo_analyst: 2,
  ai_memory_aggregator: 2,
  content_publish_scheduler: 2,
  whatsapp_inbound_processor: 2,

  // Tier 3 — multi-domain, high-stakes, exec/compliance.
  qs_cost_analyst: 3,
  tax_assistant: 3,
  executive_business: 3,
  procurement_analyst: 3,
  construction_supervisor: 3,
};

/**
 * Resolve an agent code to its tier. Unknown codes default to Tier 2 —
 * the safe middle. Adding a new code? Add it to `AGENT_TIER_MAP`.
 */
export function agentCodeToTier(code: string): AgentTier {
  return AGENT_TIER_MAP[code] ?? 2;
}

/**
 * Tier-to-model lookup per provider. Returns the canonical model name
 * the existing `getAIProviderByName(provider)` understands.
 *
 * Anthropic uses the latest 4.x cohort; OpenAI uses the 4o cohort;
 * Gemini uses 1.5. Update here when a new model is added to the
 * `cost.ts` rate table.
 */
const TIER_MODEL_MAP: Record<ProviderName, Record<AgentTier, string>> = {
  anthropic: {
    1: "claude-haiku-4-5",
    2: "claude-sonnet-4-6",
    3: "claude-opus-4-7",
  },
  openai: {
    1: "gpt-4o-mini",
    2: "gpt-4o",
    3: "gpt-4o", // OpenAI doesn't ship a clear "tier 3" today; stays on 4o.
  },
  gemini: {
    1: "gemini-1.5-flash",
    2: "gemini-1.5-pro",
    3: "gemini-1.5-pro",
  },
  dry_run: {
    1: "dry-run-tier1",
    2: "dry-run-tier2",
    3: "dry-run-tier3",
  },
};

export function tierToModel(tier: AgentTier, provider: ProviderName): string {
  return TIER_MODEL_MAP[provider][tier];
}

/**
 * Inverse — for a given model name return its tier (best effort).
 * Used by the daily aggregate cron to bucket runs into `by_tier`.
 */
export function modelToTier(model: string): AgentTier {
  // Walk the tier-model map; first match wins.
  for (const provider of Object.keys(TIER_MODEL_MAP) as ProviderName[]) {
    for (const tier of [1, 2, 3] as AgentTier[]) {
      if (TIER_MODEL_MAP[provider][tier] === model) return tier;
    }
  }
  // Default mid-tier for unknown models so they don't disappear from
  // dashboards.
  return 2;
}
