import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P2.1 — agent tool registry.
 *
 * The AI SDK's `Tool.execute` signature takes `(input, { abortSignal })`
 * with no custom-context argument. Agent tools, however, need to know
 * which org / user / date they're running for. The registry resolves
 * this by storing **factories** rather than tools directly: a factory
 * is `(ctx: AgentExecutionContext) => Tool`. At inference time the
 * runner calls each factory with the current run's context, producing
 * a `Record<string, Tool>` ready to hand to `generateText({ tools })`.
 *
 * Each per-agent module (`tools/mgmt-os/*.ts`, `tools/dev-os/*.ts`)
 * imports `registerToolFactory` and calls it at module-eval time.
 * The barrel `tools/index.ts` imports all those modules so the
 * registry is fully populated by the first call to `getToolsForAgent`.
 *
 * Per-agent allowlist: `AGENT_TOOL_ACCESS` maps agent_code →
 * permitted tool names. `getToolsForAgent` intersects the registry
 * with the allowlist so a misconfigured agent_code can't accidentally
 * access every tool in the registry.
 */

import type { Tool } from "ai";

export interface AgentExecutionContext {
  /** Organization the agent is operating for (server-resolved). */
  orgId: string;
  /** App user id (the digest recipient OR the chat-initiating user). */
  userId: string;
  /** ISO YYYY-MM-DD — the "as of" date the agent should query.
   *  For Daily Digest this is yesterday in the user's timezone. */
  date?: string;
  /** IANA timezone of the recipient. */
  timezone?: string;
}

export type AgentToolFactory = (ctx: AgentExecutionContext) => Tool;

const factories = new Map<string, AgentToolFactory>();

/**
 * Per-agent tool allowlist. Adding a tool to the registry does NOT
 * make it callable by every agent — agent_code must also appear here
 * with the tool name listed. Keeps blast radius narrow and makes
 * agent capabilities auditable from a single table.
 */
const AGENT_TOOL_ACCESS: Record<string, readonly string[]> = {
  daily_digest_mgmt: [
    "get_bookings_for_date",
    "get_financial_activity_for_date",
    "get_operational_incidents_for_date",
  ],
  daily_digest_dev: [
    // Wired in Phase 3.
    "get_site_reports_for_date",
    "get_construction_expenses_for_date",
    "get_milestone_changes_for_date",
  ],
};

export function registerToolFactory(
  name: string,
  factory: AgentToolFactory,
): void {
  if (factories.has(name)) {
    // Module re-load in dev: keep the latest definition. In production
    // (one-shot module load) this branch is unreachable.
    factories.set(name, factory);
    return;
  }
  factories.set(name, factory);
}

export function listRegisteredToolNames(): string[] {
  return Array.from(factories.keys()).sort();
}

/**
 * Build the per-run tool map for an agent. Empty object if the agent
 * has no allowlist entry — that's how non-tool-using agents (e.g.
 * tax_assistant today) opt out implicitly.
 */
export function getToolsForAgent(
  agentCode: string,
  ctx: AgentExecutionContext,
): Record<string, Tool> {
  const allowed = AGENT_TOOL_ACCESS[agentCode] ?? [];
  const out: Record<string, Tool> = {};
  for (const name of allowed) {
    const factory = factories.get(name);
    if (!factory) {
      console.warn(
        `[agent-tools] agent '${agentCode}' allowlists '${name}' but no factory is registered — skipping`,
      );
      continue;
    }
    out[name] = factory(ctx);
  }
  return out;
}
