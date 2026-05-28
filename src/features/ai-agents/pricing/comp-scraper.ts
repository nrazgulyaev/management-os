/**
 * Phase 2.4 mgmt-02 — comp-scraper agent (stub).
 *
 * Pulls external rates for active comp_villas + refreshes
 * similarity_score. 2×/day to keep data fresh without hammering
 * channel APIs.
 */

export interface CompScraperInput {
  organizationId: string;
  villaId?: string;
}

export interface CompScraperOutput {
  scraped: number;
  errors: number;
  resimilarityComputed: number;
}

export async function run(_input: CompScraperInput): Promise<CompScraperOutput> {
  return { scraped: 0, errors: 0, resimilarityComputed: 0 };
}

export const COMP_SCRAPER_AGENT = {
  agentCode: "comp-scraper",
  cron: "0 6,18 * * *",
  description: "2x/day pull of external rates for comp_villas; refreshes similarity scores.",
} as const;
