/**
 * Phase 2.2 dev-04 — vendor-score-updater agent (stub).
 *
 * Nightly cron. Walks every active vendor, rolls up the last 90
 * days of PO + delivery + warranty + RFQ-response data, runs
 * `computeVendorScore`, and upserts `vendor_scores`.
 */

import type { VendorScoreComponents } from "@/features/vendors/scoring";

export interface VendorScoreUpdaterInput {
  organizationId: string;
}

export interface VendorScoreUpdaterOutput {
  updated: number;
  /** Vendors that crossed a band threshold tonight (for the digest). */
  bandChanges: { vendorId: string; from: string; to: string }[];
}

export async function run(_input: VendorScoreUpdaterInput): Promise<VendorScoreUpdaterOutput> {
  return { updated: 0, bandChanges: [] };
}

export const VENDOR_SCORE_UPDATER_AGENT = {
  agentCode: "vendor-score-updater",
  cron: "0 3 * * *",
  description: "Nightly vendor composite score refresh from PO/delivery/warranty/RFQ history.",
} as const;

// Re-export for convenience.
export type { VendorScoreComponents };
