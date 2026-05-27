/**
 * Phase 2.3 owner-06 — generateOwnerBundle.
 *
 * Stitches owner-visible PDFs into a single ZIP for on-demand
 * download. Two bundle kinds:
 *   - "year-end"        — every statement PDF + tax summary for the year
 *   - "monthly-tax"     — 12 months of PHR + WHT certs
 *
 * Cached 24h via unstable_cache; cache is keyed on (ownerId, kind,
 * year). Regeneration happens when any underlying document changes
 * — the data PR wires that invalidation.
 *
 * Today returns a stub URL; the real implementation uses the
 * existing pdf-stitcher infra under src/lib/pdf/.
 */

import "server-only";
import { unstable_cache } from "next/cache";

export type BundleKind = "year-end" | "monthly-tax";

export interface BundleResult {
  url: string | null;
  filename: string;
  generatedAt: string;
  cached: boolean;
}

async function build(ownerId: string, kind: BundleKind, year: number): Promise<BundleResult> {
  void ownerId;
  return {
    url: null,
    filename: `${kind}-${year}.zip`,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
}

export function generateOwnerBundle(ownerId: string, kind: BundleKind, year: number) {
  const fn = unstable_cache(
    () => build(ownerId, kind, year),
    ["owner-bundle", ownerId, kind, String(year)],
    { revalidate: 60 * 60 * 24 },
  );
  return fn();
}
