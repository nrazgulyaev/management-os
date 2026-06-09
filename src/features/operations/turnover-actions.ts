"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { turnovers, TURNOVER_STATUSES } from "@/lib/db/schema/turnovers";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";

/**
 * W4 mgmt-04 — turnover board status persistence.
 *
 * Wired from <TurnoverBoardClient> (the client wrapper around
 * <TurnoverBoard>): dragging a card between columns calls
 * updateTurnoverStatusAction with the card id + target status.
 * Permission-gated on operations.write, audit-logged like sibling
 * operations mutations.
 */

export interface TurnoverActionResult {
  ok: boolean;
  error?: string;
}

const updateTurnoverStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(TURNOVER_STATUSES),
});

export async function updateTurnoverStatusAction(
  input: z.infer<typeof updateTurnoverStatusSchema>,
): Promise<TurnoverActionResult> {
  await requirePermission("operations.write");

  const parsed = updateTurnoverStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid turnover or status." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(turnovers)
    .where(eq(turnovers.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Turnover not found." };

  if (before.status === parsed.data.status) return { ok: true };

  const now = new Date();
  const patch: Partial<typeof turnovers.$inferInsert> = {
    status: parsed.data.status,
    updatedAt: now,
  };
  // Stamp lifecycle timestamps the first time the card enters the column.
  if (parsed.data.status === "in-progress" && !before.startedAt) patch.startedAt = now;
  if (parsed.data.status === "done" && !before.completedAt) patch.completedAt = now;

  await db.update(turnovers).set(patch).where(eq(turnovers.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "operations.turnover.status",
    entityType: "turnover",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.status },
  });

  revalidatePath("/dashboard/operations/turnovers");
  revalidatePath("/dashboard/operations");
  return { ok: true };
}
