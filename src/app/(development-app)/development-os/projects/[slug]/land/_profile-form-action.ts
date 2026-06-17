"use server";

/**
 * UI action wrapper for upsertLandProfile (server-only module). The land
 * profile page previously showed the API surface read-only with no way to
 * create or edit a profile. This wires the create/edit form. The underlying
 * action enforces requireInternalUser + requireOrgId, stamps org on insert,
 * and revalidates the land page.
 */

import { upsertLandProfile } from "@/lib/development/server/land/land-actions";

type AcquisitionMode =
  | "leasehold"
  | "freehold"
  | "joint_venture"
  | "landowner_partnership"
  | "nominee"
  | "revenue_share"
  | "custom";

export async function upsertLandProfileAction(input: {
  projectId: string;
  acquisitionMode: AcquisitionMode;
  acquisitionDate?: string;
  leaseStartDate?: string;
  leaseExpiryDate?: string;
  leaseTenureYears?: number;
  totalLandSizeSqm?: string;
  zoningClassification?: string;
  notes?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { id } = await upsertLandProfile({
      projectId: input.projectId,
      acquisitionMode: input.acquisitionMode,
      acquisitionDate: input.acquisitionDate || undefined,
      leaseStartDate: input.leaseStartDate || undefined,
      leaseExpiryDate: input.leaseExpiryDate || undefined,
      leaseTenureYears:
        input.leaseTenureYears && input.leaseTenureYears > 0
          ? input.leaseTenureYears
          : undefined,
      totalLandSizeSqm: input.totalLandSizeSqm?.trim() || undefined,
      zoningClassification: input.zoningClassification?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    });
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to save land profile.",
    };
  }
}
