"use server";

/**
 * UI adapter for change-order lifecycle transitions. transitionChangeOrder is
 * "use server" + org-scoped + validates the state machine, but does not
 * revalidate. This wrapper adds per-slug revalidation + a uniform result shape.
 */

import { revalidatePath } from "next/cache";
import { transitionChangeOrder } from "@/lib/development/server/change-orders/change-order-actions";

type ChangeOrderStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

export async function transitionChangeOrderAction(input: {
  changeOrderId: string;
  slug: string;
  code: string;
  to: ChangeOrderStatus;
  approvalNotes?: string;
  rejectionReason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await transitionChangeOrder({
      changeOrderId: input.changeOrderId,
      to: input.to,
      approvalNotes: input.approvalNotes?.trim() || null,
      rejectionReason: input.rejectionReason?.trim() || null,
    });
    revalidatePath(
      `/development-os/projects/${input.slug}/change-orders/${input.code}`,
    );
    revalidatePath(`/development-os/projects/${input.slug}/change-orders`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to transition change order.",
    };
  }
}
