"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { setReadinessSchema } from "@/features/availability/schema";
import { setVillaReadiness } from "./services";
import type { ActionResult } from "@/features/projects/actions";

export async function setVillaReadinessAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { stateId?: string }> {
  await requirePermission("readiness.write");
  const raw = Object.fromEntries(formData.entries());
  const parsed = setReadinessSchema.safeParse({
    ...raw,
    relatedBookingId: raw.relatedBookingId || null,
    relatedTaskId: raw.relatedTaskId || null,
    notes: raw.notes || null,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();

  const out = await setVillaReadiness({
    villaId: parsed.data.villaId,
    readinessStatus: parsed.data.readinessStatus,
    relatedBookingId: parsed.data.relatedBookingId ?? null,
    relatedTaskId: parsed.data.relatedTaskId ?? null,
    notes: parsed.data.notes ?? null,
    changedBy: me?.id ?? null,
  });

  if (out.changed) {
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "readiness.set",
      entityType: "villa",
      entityId: parsed.data.villaId,
      after: { readinessStatus: parsed.data.readinessStatus },
    });
  }

  revalidatePath("/dashboard/readiness");
  revalidatePath("/dashboard/front-office");
  return { ok: true, stateId: out.stateId ?? undefined };
}
