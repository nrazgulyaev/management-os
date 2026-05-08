/**
 * Stage 9.F.1 — canonical list of configurable agents (pure constants).
 *
 * Mirrors the CHECK constraint in migration 0090. Split out so client
 * components + tests can import without the `server-only` chain via the
 * actions module.
 *
 * The 7 runnable agents from `RUN_NOW_AGENTS` (Phase 8.B) plus the two
 * system surfaces operators also configure: `inbox` (review queue
 * visibility) and `memory` (project memory layer).
 */

export const CONFIGURABLE_AGENTS = [
  "qs_cost_analyst",
  "procurement_analyst",
  "tax_assistant",
  "marketing_assistant",
  "executive_business",
  "daily_digest",
  "weekly_plan",
  "inbox",
  "memory",
] as const;

export type ConfigurableAgentKey = (typeof CONFIGURABLE_AGENTS)[number];

export interface AgentDescription {
  label: string;
  blurb: string;
  /** Tier classification from src/lib/ai/router/tier-rules.ts. */
  tier: 1 | 2 | 3;
  /** Short tag explaining what the operator gets. */
  category: "agent" | "system";
}

export const AGENT_CATALOG: Record<ConfigurableAgentKey, AgentDescription> = {
  qs_cost_analyst: {
    label: "QS Cost Analyst",
    blurb: "Forecast at completion, cost overrun analysis, BOQ category breakdown.",
    tier: 3,
    category: "agent",
  },
  procurement_analyst: {
    label: "Procurement Analyst",
    blurb: "RFQ + quotation analysis, supplier price-spread alerts.",
    tier: 3,
    category: "agent",
  },
  tax_assistant: {
    label: "Tax Assistant",
    blurb: "Tax-relevant transaction roll-up + filing-deadline reminders.",
    tier: 3,
    category: "agent",
  },
  marketing_assistant: {
    label: "Marketing Assistant",
    blurb: "Campaign + leads-by-source summary, channel-performance signals.",
    tier: 2,
    category: "agent",
  },
  executive_business: {
    label: "Executive Business",
    blurb: "Weekly executive snapshot — revenue, project health, next decision.",
    tier: 3,
    category: "agent",
  },
  daily_digest: {
    label: "Daily Digest",
    blurb: "Operational digest — arrivals, departures, open tickets, exceptions.",
    tier: 2,
    category: "agent",
  },
  weekly_plan: {
    label: "Weekly Plan",
    blurb: "Operational plan — scheduled work, expected revenue, capacity hits.",
    tier: 2,
    category: "agent",
  },
  inbox: {
    label: "Agent Inbox",
    blurb: "Review queue for outputs awaiting approve / reject / edit.",
    tier: 1,
    category: "system",
  },
  memory: {
    label: "Project Memory",
    blurb: "Per-project knowledge layer feeding all agents' retrieval.",
    tier: 1,
    category: "system",
  },
};
