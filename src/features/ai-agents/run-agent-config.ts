/**
 * Stage 8.B.1 — Run-now agent configuration map (pure constants).
 *
 * Split out of `run-agent-action.ts` so tests + client components can
 * import without pulling in `server-only` (transitively required by
 * the action's DB client + aiExecute imports).
 */

export const RUN_NOW_AGENTS = {
  qs_cost_analyst: {
    slug: "qs-cost-analyst",
    label: "QS Cost Analyst",
    kickoffPrompt:
      "Produce a one-paragraph snapshot of current cost-overrun risk across active BOQ documents. List the top three categories worth attention.",
  },
  procurement_analyst: {
    slug: "procurement-analyst",
    label: "Procurement Analyst",
    kickoffPrompt:
      "Summarize the current state of open RFQs and recent quotation deltas. Flag suppliers with widening price spreads.",
  },
  tax_assistant: {
    slug: "tax-assistant",
    label: "Tax Assistant",
    kickoffPrompt:
      "Summarize the current month's tax-relevant transactions and any periods nearing a filing deadline.",
  },
  marketing_assistant: {
    slug: "marketing-assistant",
    label: "Marketing Assistant",
    kickoffPrompt:
      "Summarize active campaigns, leads-by-source, and any underperforming channels worth pausing.",
  },
  executive_business: {
    slug: "executive-business",
    label: "Executive Business",
    kickoffPrompt:
      "Produce a one-paragraph executive snapshot covering revenue trajectory, project health, and the single most important decision the operator should make this week.",
  },
  daily_digest: {
    slug: "daily-digest",
    label: "Daily Digest",
    kickoffPrompt:
      "Generate today's operational digest: arrivals, departures, open maintenance tickets, payment exceptions.",
  },
  weekly_plan: {
    slug: "weekly-plan",
    label: "Weekly Plan",
    kickoffPrompt:
      "Generate this week's operational plan: scheduled work, expected revenue, capacity bottlenecks.",
  },
} as const;

export type RunNowAgentKey = keyof typeof RUN_NOW_AGENTS;
