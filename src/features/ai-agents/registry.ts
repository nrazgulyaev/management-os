/**
 * Phase 2.1 PR 4 — public AI-agent registry.
 *
 * Thin server-safe export of the canonical agent codes so the Next
 * `[agentCode]` dynamic routes can call `generateStaticParams`
 * without pulling in the full hub-cabinet queries module (which
 * imports `server-only`).
 *
 * Mgmt and Dev have overlapping agent code sets but Dev's
 * `procurement_analyst` / `qs_cost_analyst` aren't on the Mgmt
 * registry — and vice versa. We keep both lists here so each route
 * can statically validate its own params.
 *
 * Codes here use the URL-friendly hyphenated form. The hub queries
 * still use the legacy underscored form (`concierge_handoff`) for
 * DB columns; map between them via `toUnderscored` if needed.
 */

export const MGMT_AGENT_CODES = [
  "concierge-auto-reply",
  "statement-preparer",
  "daily-digest",
  "pricing-optimizer",
  "owner-intelligence",
  "maintenance-triage",
  "executive-business",
  "tax-assistant",
  "weekly-plan",
  "marketing-assistant",
  "procurement-analyst",
  "inbox",
  "memory",
  // Phase 2 data-wiring PR 1 — event-triggered (no cron). Code stubs
  // already exist under src/features/ai-agents/{statements,owners}/.
  "statement-anomaly-detector",
  "onboarding-doc-checker",
  // Phase 2 data-wiring PR 3 — event-triggered on owner_messages insert
  // where actor_kind='owner'. Code stub at
  // src/features/ai-agents/owners/owner-concierge.ts.
  "owner-concierge",
] as const;

export type MgmtAgentCode = (typeof MGMT_AGENT_CODES)[number];

export const DEV_AGENT_CODES = [
  "qs-cost-analyst",
  "procurement-analyst",
  "tax-assistant",
  "daily-digest",
  "weekly-plan",
  "marketing-assistant",
  "executive-business",
  "memory",
  // Phase 2 data-wiring PR 2 — agents whose code stubs ship under
  // src/features/ai-agents/{bookings,operations,projects,cfo,boq,vendors}/.
  // Cron-scheduled (per 02-dev.md):
  "arrival-prep",                 // hourly
  "turnover-allocator",           // every 90s
  "schedule-variance-detector",   // daily 05:30
  "weekly-report-composer",       // Friday 09:00
  "cashflow-forecaster",          // daily 04:00 — refreshes monthly_projections JSONB
  "vendor-score-updater",         // nightly 02:00
  // Event-triggered (invoked from action code):
  "rfi-router",                   // on RFI compose
  "capital-call-drafter",         // when project cash < 14d runway
  "variance-detector",            // hourly + on actuals write
  "cost-coder",                   // on invoice upload
  "cost-anomaly-explainer",       // on variance flag
  "vendor-matcher",               // on RFQ create + at award time
  "quote-parser",                 // on PDF upload
] as const;

export type DevAgentCode = (typeof DEV_AGENT_CODES)[number];

export function toUnderscored(code: string): string {
  return code.replace(/-/g, "_");
}

export function toHyphenated(key: string): string {
  return key.replace(/_/g, "-");
}
