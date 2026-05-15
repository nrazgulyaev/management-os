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
  // Sprint MD-5 — five new dry-run-default Mgmt-OS agents seeded by
  // migrations 0098–0102. Each ships with preferred_model='claude-
  // haiku-4-5' (tier 1) and requires the per-org BYO key UI to flip
  // them live. Adding them here un-404s the settings detail page.
  "investor_copilot",
  "front_office_copilot",
  "housekeeping_scheduler",
  "concierge_handoff",
  "security_copilot",
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
  // Sprint MD-5 — Mgmt-OS cabinet co-pilots. All five seed as
  // tier-1 (Haiku) per their migrations; operators upgrade per-org
  // via the BYO key UI on the per-agent detail page.
  investor_copilot: {
    label: "Investor Co-pilot",
    blurb:
      "Plain-language explanation of LP position changes — calls, distributions, NAV deltas — bilingual via portal_language.",
    tier: 1,
    category: "agent",
  },
  front_office_copilot: {
    label: "Front Office Co-pilot",
    blurb:
      "Today's exception list across arrivals, in-house guests, and open requests — ranked by severity.",
    tier: 1,
    category: "agent",
  },
  housekeeping_scheduler: {
    label: "Housekeeping Scheduler",
    blurb:
      "Tomorrow's turnover plan — cleaner assignments + drive-time + supervisor sign-off flags.",
    tier: 1,
    category: "agent",
  },
  concierge_handoff: {
    label: "Concierge Handoff",
    blurb:
      "Ranked attention list across active concierge sessions — urgent / elevated / watch — with PII redacted.",
    tier: 1,
    category: "agent",
  },
  security_copilot: {
    label: "Security Co-pilot",
    blurb:
      "Overnight incident brief from auth_security_events + patrol completion + camera alerts.",
    tier: 1,
    category: "agent",
  },
};
