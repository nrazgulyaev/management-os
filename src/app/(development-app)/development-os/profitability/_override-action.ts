"use server";

/**
 * Wire-up — "use server" adapter for the server-only overrideUnitAllocation
 * action. The underlying action already enforces requireInternalUser and
 * requires audit notes; this wrapper only adapts the call shape to
 * {ok}|{ok,error}, converts user-entered *major* bucket amounts to *minor*
 * BIGINT, and revalidates the profitability path. NO authority added.
 */

import { revalidatePath } from "next/cache";
import { overrideUnitAllocation } from "@/lib/development/server/profitability/profitability-actions";

const PATH = "/development-os/profitability";

type ActionResult = { ok: true } | { ok: false; error: string };

type BucketKey =
  | "landCostAllocatedMinor"
  | "hardCostDirectMinor"
  | "hardCostAllocatedMinor"
  | "softCostAllocatedMinor"
  | "marketingCostAllocatedMinor"
  | "financingCostAllocatedMinor"
  | "contingencyUsedMinor"
  | "expectedSalePriceMinor";

const BUCKET_KEYS: BucketKey[] = [
  "landCostAllocatedMinor",
  "hardCostDirectMinor",
  "hardCostAllocatedMinor",
  "softCostAllocatedMinor",
  "marketingCostAllocatedMinor",
  "financingCostAllocatedMinor",
  "contingencyUsedMinor",
  "expectedSalePriceMinor",
];

/** Convert a major-unit amount string to a non-negative minor BIGINT.
 *  Cost-allocation buckets in this schema carry 2 minor digits. */
function majorToMinor(major: string): bigint {
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Bucket amounts must be non-negative numbers.");
  }
  return BigInt(Math.round(n * 100));
}

export interface OverrideAllocationFormInput {
  allocationId: string;
  notes: string;
  /** Major-unit strings keyed by bucket; blank/undefined entries are skipped. */
  overridesMajor: Partial<Record<BucketKey, string>>;
}

export async function overrideUnitAllocationAction(
  input: OverrideAllocationFormInput,
): Promise<ActionResult> {
  try {
    const notes = (input.notes ?? "").trim();
    if (!notes) {
      throw new Error("A reason (notes) is required for a manual override.");
    }

    const overrides: Partial<Record<BucketKey, bigint>> = {};
    for (const key of BUCKET_KEYS) {
      const raw = (input.overridesMajor?.[key] ?? "").toString().trim();
      if (raw === "") continue;
      overrides[key] = majorToMinor(raw);
    }

    if (Object.keys(overrides).length === 0) {
      throw new Error("Enter at least one bucket value to override.");
    }

    const result = await overrideUnitAllocation({
      allocationId: input.allocationId,
      notes,
      overrides,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to override allocation.",
    };
  }
}
