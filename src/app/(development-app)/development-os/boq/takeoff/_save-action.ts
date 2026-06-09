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
  resolveTakeoffRevisionImage,
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

/** Result of auto-resolving the selected revision's drawing image. */
export interface RevisionImageResult {
  /** Signed URL the browser can load into the viewer, or null. */
  url: string | null;
  /** True when the revision document is a PDF (DrawingViewer rasters only). */
  isPdf: boolean;
  /** True when the document row has no stored file yet. */
  missingFile: boolean;
}

/**
 * Auto-resolve the signed image URL for the selected drawing revision so the
 * estimator no longer re-uploads the plan by hand. Org-scoped + permission-
 * gated: the resolver verifies the revision belongs to the caller's org before
 * signing. Returns a typed failure rather than throwing so the workbench can
 * fall back to manual upload.
 */
export async function loadRevisionImageAction(
  revisionId: string,
): Promise<
  { ok: true; image: RevisionImageResult } | { ok: false; error: string }
> {
  try {
    await requireInternalUser();
    const orgId = await requireOrgId();
    const image = await resolveTakeoffRevisionImage(orgId, revisionId);
    if (!image) {
      return { ok: false, error: "Drawing revision not found for this org." };
    }
    return {
      ok: true,
      image: {
        url: image.isPdf ? null : image.url,
        isPdf: image.isPdf,
        missingFile: image.missingFile,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "image_failed" };
  }
}
