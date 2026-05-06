/**
 * Prompt 112 — Tunables for the demo-data validation + rebuild
 * scripts.  Centralised so QA + tests can import the same numbers.
 */

/** Minimum row counts the validation script asserts per module.  These
 *  are floors, not ceilings — the seed grows over time but should
 *  never shrink below these. */
export const DEMO_MIN_ROW_COUNTS = {
  projects: 3,
  villas: 6,
  owners: 3,
  ownership_shares: 3,
  app_users: 5,
  app_users_owners: 1,
  bookings: 3,
  direct_booking_holds: 3,
  direct_booking_requests: 3,
  direct_booking_finance_links: 3,
  owner_booking_summaries: 5,
  owner_visible_events: 3,
  owner_revenue_source_monthly: 3,
  owner_statements: 3,
  in_app_notifications: 3,
  statement_source_groups: 3,
  statement_explanation_snapshots: 1,
  guest_stay_tokens: 1,
  guest_services: 5,
  villa_guide_sections: 3,
  villa_wifi_credentials: 1,
  villa_emergency_contacts: 3,
  villa_neighborhood_places: 5,
  service_vendors: 1,
  service_fulfilments: 5,
  operation_tasks: 10,
  notification_templates: 5,
  notifications: 5,
  job_definitions: 5,
  ai_runs: 2,
  auth_login_attempts: 3,
  auth_security_events: 3,
  job_locks: 1,
  pricing_rule_sets: 1,
  preventive_plans: 3,
  utility_accounts: 3,
  inventory_items: 10,
  procurement_requests: 2,
  procurement_orders: 2,
  villa_calendar_blocks: 2,
} as const;

/**
 * P116A — Tables that are *optional* for v1 — the validator never
 * marks the run failed if these are below the floor; it only reports
 * a warning.  Useful for tables introduced after a migration that
 * may not yet be in the staging DB.
 */
export const DEMO_OPTIONAL_TABLES = new Set<string>([
  "ai_runs",
  "in_app_notifications",
  "owner_visible_events",
  "owner_statements",
  "service_fulfilments",
  "villa_guide_sections",
  "villa_wifi_credentials",
  "villa_emergency_contacts",
  "villa_neighborhood_places",
  "preventive_plans",
  "utility_accounts",
  "inventory_items",
  "procurement_requests",
  "procurement_orders",
  "operation_tasks",
  "notifications",
  "app_users_owners",
]);

/** Tokens / fragments that must NEVER appear in owner-facing or
 *  guest-facing projection text, descriptions, or labels. */
export const BANNED_PROJECTION_TOKENS = [
  // Internal row identifiers.
  "revenue_line_id",
  "revenueLineId",
  "expense_line_id",
  "expenseLineId",
  "finance_link_id",
  "financeLinkId",
  "statement_period_id",
  "statementPeriodId",
  // Provider / payment internals.
  "provider_session_id",
  "providerSessionId",
  "provider_account_id",
  "providerAccountId",
  "webhook_payload",
  "webhookPayload",
  "webhook_event_id",
  "webhookEventId",
  // Tokens / hashes.
  "token_hash",
  "tokenHash",
  "hold_token_hash",
  "holdTokenHash",
  "configPrivateEncrypted",
  "config_private_encrypted",
  // Internal admin notes.
  "internalNotes",
  "internal_notes",
  "decisionNote",
  "decision_note",
  "rejectionInternalReason",
] as const;

/** Patterns we use to detect obviously-real PII that must not appear in
 *  owner-facing seed strings. */
export const PII_PATTERNS = {
  // Anything with an @ that isn't .test (we allow .test-domain demo emails).
  realLookingEmail:
    /\b[A-Za-z0-9._%+-]+@(?:(?!example\.test\b)[A-Za-z0-9.-]+)\.[A-Za-z]{2,}\b/,
  // International phone — `+` then ≥ 7 digits.
  realLookingPhone: /\+\d[\d\s\-().]{6,}\d/,
  // ≥ 24-char base64-ish blob — likely a token / hash / provider id.
  longToken: /\b[A-Za-z0-9_\-+/=]{24,}\b/,
};

/** Demo-only token strings.  These are NOT secrets — they're labelled
 *  fixtures that the QA walkthrough doc references.  The DB stores
 *  only their SHA-256 hashes; the public hold / stay routes derive
 *  their lookups from the raw token in the URL.
 *
 *  In a fresh demo environment these tokens are NOT actually live
 *  (no row exists with the matching hash).  See QA-DEMO-WALKTHROUGH.md
 *  for the workflow to mint a live token via the public hold form.  */
export const DEMO_TOKEN_FIXTURES = {
  /** Doc-only — placeholder so QA copy can show shape. */
  demoHoldToken: "DEMO_HOLD_TOKEN_PLACEHOLDER",
  /** Doc-only — placeholder so QA copy can show shape. */
  demoStayToken: "DEMO_STAY_TOKEN_PLACEHOLDER",
  /** Doc-only — placeholder for a vendor service token. */
  demoVendorToken: "DEMO_VENDOR_TOKEN_PLACEHOLDER",
};
