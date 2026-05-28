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
] as const;

export type DevAgentCode = (typeof DEV_AGENT_CODES)[number];

export function toUnderscored(code: string): string {
  return code.replace(/-/g, "_");
}

export function toHyphenated(key: string): string {
  return key.replace(/_/g, "-");
}
