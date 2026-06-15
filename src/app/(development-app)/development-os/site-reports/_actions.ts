"use server";

/**
 * Wire-up — "use server" adapters for the site-report zone + material
 * consumption actions. Both underlying actions are positional/`use server`
 * but return non-normalized shapes, so these wrappers adapt the call shape to
 * {ok} | {ok:false,error} and revalidate the affected paths.
 *
 * The underlying actions (createSiteZone / recordMaterialConsumption in
 * site-report-actions.ts) already enforce tenant org-scoping + atomic writes.
 * These wrappers add NO authority — they only adapt the call shape for the UI.
 */

import { revalidatePath } from "next/cache";
import {
  createSiteZone,
  recordMaterialConsumption,
} from "@/lib/development/server/site-report-actions";

const REPORTS_PATH = "/development-os/site-reports";
const ZONES_PATH = "/development-os/site-reports/zones";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

// ---------------------------------------------------------------------------
// Site zone create
// ---------------------------------------------------------------------------

export interface CreateSiteZoneFormInput {
  projectId: string;
  zoneCode: string;
  zoneName: string;
  zoneType: string;
  villaId?: string | null;
  expectedStartDate?: string | null;
  expectedCompletionDate?: string | null;
  displayOrder?: number;
  notes?: string | null;
}

export async function createSiteZoneAction(
  input: CreateSiteZoneFormInput,
): Promise<ActionResult> {
  try {
    await createSiteZone({
      projectId: input.projectId,
      zoneCode: input.zoneCode,
      zoneName: input.zoneName,
      // The action validates zoneType against ZONE_TYPES via zod.
      zoneType: input.zoneType as never,
      villaId: input.villaId || null,
      expectedStartDate: input.expectedStartDate || null,
      expectedCompletionDate: input.expectedCompletionDate || null,
      ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
      notes: input.notes || null,
    });
    revalidatePath(ZONES_PATH);
    revalidatePath(REPORTS_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to create zone.");
  }
}

// ---------------------------------------------------------------------------
// Material consumption
// ---------------------------------------------------------------------------

export interface RecordConsumptionFormInput {
  reportId: string;
  zoneId: string;
  poLineId: string;
  quantityConsumed: number;
  consumedAt?: string | null;
}

export async function recordMaterialConsumptionAction(
  input: RecordConsumptionFormInput,
): Promise<ActionResult> {
  try {
    if (!Number.isFinite(input.quantityConsumed) || input.quantityConsumed <= 0) {
      throw new Error("Quantity consumed must be a positive number.");
    }
    await recordMaterialConsumption({
      reportId: input.reportId,
      zoneId: input.zoneId,
      poLineId: input.poLineId,
      quantityConsumed: input.quantityConsumed,
      consumedAt: input.consumedAt || undefined,
    });
    revalidatePath(`${REPORTS_PATH}/${input.reportId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to record material consumption.");
  }
}
