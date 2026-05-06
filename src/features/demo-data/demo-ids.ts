/**
 * Prompt 112 — Stable UUID fixtures used across `drizzle/seed.sql`.
 *
 * All IDs are deterministic so:
 *   - admin pages can deep-link to specific demo records,
 *   - the validation script can assert exactly the expected fixtures
 *     without touching real production data,
 *   - cross-references between modules (booking → guest stay → finance
 *     link → owner statement → owner booking summary) survive a
 *     `npm run db:seed` re-run.
 *
 * NEVER reuse these IDs for real data.  Every production deployment
 * should re-seed against a clean schema.
 */

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------
export const DEMO_PROJECT_IDS = {
  eternal: "1eda0001-0000-0000-0000-000000000001",
  enso: "1eda0001-0000-0000-0000-000000000002",
  ahau: "1eda0001-0000-0000-0000-000000000003",
} as const;

// -----------------------------------------------------------------------------
// Villas — keys are the unit_code we expect to see in admin lists.
// -----------------------------------------------------------------------------
export const DEMO_VILLA_IDS = {
  "EV-S1": "1eda0002-0000-0000-0000-000000000001",
  "EV-S2": "1eda0002-0000-0000-0000-000000000002",
  "EV-S5": "1eda0002-0000-0000-0000-000000000003",
  "EV-S6": "1eda0002-0000-0000-0000-000000000004",
  "ES-S1": "1eda0002-0000-0000-0000-000000000010",
  "ES-S2": "1eda0002-0000-0000-0000-000000000011",
  "ES-S5": "1eda0002-0000-0000-0000-000000000012",
  "ES-S6": "1eda0002-0000-0000-0000-000000000013",
  "AH-01": "1eda0002-0000-0000-0000-000000000020",
  "AH-02": "1eda0002-0000-0000-0000-000000000021",
} as const;

// -----------------------------------------------------------------------------
// Owners
// -----------------------------------------------------------------------------
export const DEMO_OWNER_IDS = {
  emma: "1eda0003-0000-0000-0000-000000000001",
  takeda: "1eda0003-0000-0000-0000-000000000002",
  sonoma: "1eda0003-0000-0000-0000-000000000003",
} as const;

// -----------------------------------------------------------------------------
// Direct booking holds + requests + deposits + finance links.
// -----------------------------------------------------------------------------
export const DEMO_DIRECT_BOOKING_IDS = {
  // Holds
  hold001: "cc000002-0000-0000-0000-000000000001",
  hold002: "cc000002-0000-0000-0000-000000000002",
  hold003: "cc000002-0000-0000-0000-000000000003",
  // Requests
  request001: "cc000003-0000-0000-0000-000000000001",
  request002: "cc000003-0000-0000-0000-000000000002",
  request003: "cc000003-0000-0000-0000-000000000003",
  // Deposits
  deposit001: "dd000003-0000-0000-0000-000000000001",
  deposit003: "dd000003-0000-0000-0000-000000000003",
  // Finance links
  financeLink001: "ee000002-0000-0000-0000-000000000001",
  financeLink002: "ee000002-0000-0000-0000-000000000002",
  financeLink003: "ee000002-0000-0000-0000-000000000003",
} as const;

// -----------------------------------------------------------------------------
// Owner-booking projection rows seeded by Prompt 108.  These are
// derived data — the rebuild script in Prompt 112 refreshes them.
// -----------------------------------------------------------------------------
export const DEMO_OWNER_BOOKING_SUMMARY_IDS = {
  emmaConfirmedDirect: "ff000001-0000-0000-0000-000000000001",
  emmaConfirmedDirect2: "ff000001-0000-0000-0000-000000000002",
  emmaConfirmedOta: "ff000001-0000-0000-0000-000000000003",
  emmaOwnerStay: "ff000001-0000-0000-0000-000000000004",
  emmaMaintenance: "ff000001-0000-0000-0000-000000000005",
} as const;

// -----------------------------------------------------------------------------
// Guest-status snapshots + notifications + threads (Prompt 109).
// -----------------------------------------------------------------------------
export const DEMO_GUEST_STATUS_IDS = {
  snapshotUnderReview: "ee020001-0000-0000-0000-000000000001",
  snapshotDepositRequired: "ee020001-0000-0000-0000-000000000002",
  snapshotExpired: "ee020001-0000-0000-0000-000000000003",
  threadOpen: "ee040001-0000-0000-0000-000000000001",
  threadClosed: "ee040001-0000-0000-0000-000000000002",
} as const;

// -----------------------------------------------------------------------------
// Demo email domains we use everywhere.  All `.test` per RFC 6761.
// -----------------------------------------------------------------------------
export const DEMO_EMAIL_DOMAIN = "example.test";

/**
 * Build a deterministic demo email for a given handle (e.g. "emma.owner").
 * Used by the validation script to assert no real domains slipped into
 * owner-facing seed.
 */
export function demoEmail(handle: string): string {
  return `${handle}@${DEMO_EMAIL_DOMAIN}`;
}

// -----------------------------------------------------------------------------
// Demo guest names — first-name + last-initial mask only.  Used by
// validation to assert that no full guest name leaks into owner
// projections.
// -----------------------------------------------------------------------------
export const DEMO_GUEST_LABELS = [
  "Emma W.",
  "Daniel K.",
  "Sofia M.",
  "Liam P.",
  "Aiko T.",
  "Noah S.",
] as const;
