"use server";

/**
 * Persist a takeoff measurement as a BOQ line. Wraps the existing addBoqItem
 * action (which is permission-gated, transactional, and recomputes section/
 * document totals). This closes the takeoff loop: draw → measure → cost →
 * save into the BOQ, tagged in the notes as drawing-takeoff sourced.
 */

import { addBoqItem } from "@/lib/development/server/boq/boq-actions";

export async function addTakeoffLineToBoqAction(input: {
  sectionId: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  /** unit rate in MINOR units, as a string */
  unitRateMinor: string;
  currency: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await addBoqItem({
      sectionId: input.sectionId,
      itemCode: `TO-${Date.now().toString(36).toUpperCase()}`,
      description: input.description || "Takeoff line",
      quantity: input.quantity,
      unitOfMeasure: input.unitOfMeasure,
      unitRateMinor: BigInt(input.unitRateMinor),
      rateCurrency: input.currency,
      notes: "Source: drawing takeoff",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save to BOQ." };
  }
}
