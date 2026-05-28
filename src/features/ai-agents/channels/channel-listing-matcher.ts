/**
 * Phase 2.4 mgmt-01 — channel-listing-matcher agent (stub).
 *
 * Invoked on first connect + nightly thereafter. Compares an OTA's
 * listings (name, capacity, location, photos) against our villa
 * roster and emits a 3-bucket match result (matched / ambiguous /
 * unmatched). Confidence threshold defaults: ≥ 0.85 = matched,
 * 0.55..0.85 = ambiguous, < 0.55 = unmatched.
 */

export interface ChannelListingMatcherInput {
  organizationId: string;
  channelCode: "airbnb" | "booking-com" | "avito";
}

export interface ChannelListingMatchCandidate {
  villaId: string;
  villaName: string;
  confidence: number;
}

export interface ChannelListingMatchRow {
  extId: string;
  extName: string;
  suggestedVillaId: string | null;
  candidates: ChannelListingMatchCandidate[];
  bucket: "matched" | "ambiguous" | "unmatched";
}

export interface ChannelListingMatcherOutput {
  matches: ChannelListingMatchRow[];
  matchedCount: number;
  ambiguousCount: number;
  unmatchedCount: number;
}

export async function run(_input: ChannelListingMatcherInput): Promise<ChannelListingMatcherOutput> {
  return { matches: [], matchedCount: 0, ambiguousCount: 0, unmatchedCount: 0 };
}

export const CHANNEL_LISTING_MATCHER_AGENT = {
  agentCode: "channel-listing-matcher",
  cron: "0 3 * * *",
  description: "Nightly + on-connect listing-to-villa matcher across connected OTAs.",
} as const;
