"use server";

/**
 * Block 09 ESTIMATOR — client→server bridge for the takeoff round-trip.
 *
 * Thin re-exports of the persisted-measurement actions so the workbench client
 * component can dynamic-import them. The actions themselves live in
 * `@/lib/development/server/boq/takeoff-actions` (permission-gated, org-scoped,
 * audit-logged, money in bigint MINOR) and `…/takeoff-queries` for the reader.
 */

import {
  saveTakeoffMeasurement,
  editTakeoffMeasurement,
  deleteTakeoffMeasurement,
  pushTakeoffToBoq,
} from "@/lib/development/server/boq/takeoff-actions";
import {
  listTakeoffsForRevision,
  type PersistedTakeoff,
} from "@/lib/development/server/boq/takeoff-queries";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

export {
  saveTakeoffMeasurement,
  editTakeoffMeasurement,
  deleteTakeoffMeasurement,
  pushTakeoffToBoq,
};

/** Persisted-takeoff rows are returned with bigint money as strings so they
 * cross the server→client boundary cleanly. */
export interface PersistedTakeoffWire
  extends Omit<PersistedTakeoff, "unitRateMinor" | "lineCostMinor"> {
  unitRateMinor: string;
  lineCostMinor: string;
}

/** Load persisted takeoffs for a revision (org-scoped via the action layer). */
export async function loadTakeoffsAction(
  revisionId: string,
): Promise<{ ok: true; rows: PersistedTakeoffWire[] } | { ok: false; error: string }> {
  try {
    await requireInternalUser();
    const orgId = await requireOrgId();
    const rows = await listTakeoffsForRevision(orgId, revisionId);
    return {
      ok: true,
      rows: rows.map((r) => ({
        ...r,
        unitRateMinor: r.unitRateMinor.toString(),
        lineCostMinor: r.lineCostMinor.toString(),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "load_failed" };
  }
}
