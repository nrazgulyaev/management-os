"use server";

/**
 * Front-office check-in completion. Persists the 4-step wizard's final state
 * + the door code issued at handover, advances the booking to checked_in, and
 * audit-logs. Door-code issuance was the one genuinely-missing piece of the
 * counter check-in (the existing single-shot button never issued a code).
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { bookingCheckinFlow } from "@/lib/db/schema/checkin-flow";
import { bookings } from "@/lib/db/schema/bookings";
import { canManageEntity } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";

export async function completeCheckinAction(input: {
  bookingId: string;
  steps: Record<string, unknown>;
  doorCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const now = new Date();

  const row = {
    currentStep: "handover" as const,
    stepsJson: input.steps,
    doorCode: input.doorCode,
    completedAt: now,
    completedBy: me?.id ?? null,
    updatedAt: now,
  };

  await db
    .insert(bookingCheckinFlow)
    .values({ bookingId: input.bookingId, ...row })
    .onConflictDoUpdate({ target: bookingCheckinFlow.bookingId, set: row });

  await db
    .update(bookings)
    .set({ status: "checked_in" })
    .where(eq(bookings.id, input.bookingId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "front_office.checkin.complete",
    entityType: "booking",
    entityId: input.bookingId,
    after: { doorCodeIssued: true },
  });

  revalidatePath("/dashboard/front-office/arrivals");
  revalidatePath(`/dashboard/front-office/checkin/${input.bookingId}`);
  return { ok: true };
}
