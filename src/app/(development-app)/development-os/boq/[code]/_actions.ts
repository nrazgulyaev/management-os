"use server";

/**
 * Wire-up — "use server" adapter for the server-only BOQ status
 * state-machine action. The underlying transitionBoqStatus already
 * enforces requireInternalUser + org-scoping on the update; this wrapper
 * only adapts the call shape to {ok}|{ok,error} and revalidates the
 * affected detail path. NO authority added.
 */

import { revalidatePath } from "next/cache";
import { transitionBoqStatus } from "@/lib/development/server/boq/boq-actions";

type BoqStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "tender"
  | "awarded"
  | "superseded"
  | "archived";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function transitionBoqStatusAction(input: {
  boqDocumentId: string;
  boqCode: string;
  to: BoqStatus;
}): Promise<ActionResult> {
  try {
    await transitionBoqStatus({ boqDocumentId: input.boqDocumentId, to: input.to });
    revalidatePath(
      `/development-os/boq/${encodeURIComponent(input.boqCode)}`,
    );
    revalidatePath("/development-os/boq");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to transition BOQ status.",
    };
  }
}
