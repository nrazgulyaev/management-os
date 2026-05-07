/**
 * Stage 7.0 retrofit — request router.
 *
 * Resolves which provider + model to use for a given (agent code, plan,
 * optional override). Pure module — no DB. Caller passes the plan
 * snapshot (or null when org has no subscription).
 *
 * Resolution order:
 *   1. If `providerOverride` is set → use that provider + tier-mapped
 *      model (still subject to plan.maxTier).
 *   2. Else use platform default provider (caller resolves via env).
 *   3. Tier check: agentCodeToTier(agentCode) <= plan.maxTier or block.
 *   4. Allowlist check: if plan.enabledAgentCodes.length > 0 then
 *      agentCode must be in the allowlist.
 */

import {
  agentCodeToTier,
  tierToModel,
  type AgentTier,
  type ProviderName,
} from "./tier-rules";

export interface PlanSnapshot {
  planCode: string;
  maxTier: AgentTier;
  enabledAgentCodes: string[];
}

export interface RouteRequestInput {
  agentCode: string;
  plan: PlanSnapshot | null;
  defaultProvider: ProviderName;
  providerOverride?: ProviderName;
}

export type RouteDecision =
  | {
      ok: true;
      provider: ProviderName;
      model: string;
      tier: AgentTier;
    }
  | {
      ok: false;
      reason: "tier_exceeded" | "agent_disabled";
      blockedTier?: AgentTier;
      blockedAgentCode?: string;
    };

export function routeRequest(input: RouteRequestInput): RouteDecision {
  const tier = agentCodeToTier(input.agentCode);
  const provider = input.providerOverride ?? input.defaultProvider;

  // No plan = treat as Tier 3 / all-agents-enabled (the legacy single-tenant
  // path). Plans only kick in once the org has a subscription row.
  if (input.plan) {
    if (tier > input.plan.maxTier) {
      return {
        ok: false,
        reason: "tier_exceeded",
        blockedTier: tier,
      };
    }
    if (
      input.plan.enabledAgentCodes.length > 0 &&
      !input.plan.enabledAgentCodes.includes(input.agentCode)
    ) {
      return {
        ok: false,
        reason: "agent_disabled",
        blockedAgentCode: input.agentCode,
      };
    }
  }

  return {
    ok: true,
    provider,
    model: tierToModel(tier, provider),
    tier,
  };
}
