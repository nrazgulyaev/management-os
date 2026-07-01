"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { orgTurnoverPolicy } from "@/lib/db/schema/operations";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import type { ActionResult } from "@/features/projects/actions";

const TURNOVER_POLICY_PATH = "/dashboard/operations/turnover-policy";

// "HH:MM" 24-hour clock. Stored into a postgres `time` column.
const clock = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time.");

const turnoverPolicySchema = z.object({
  checkoutTime: clock,
  checkinTime: clock,
  minTurnoverMinutes: z.coerce.number().int().min(0).max(1440),
});

/**
 * Upsert the org's turnover-times policy (the org-default row). One row per org
 * (org_turnover_policy_org_unique), so we resolve the existing row by org and
 * update-or-insert. Gated by operations.write + org-scoped; audited. Mirrors
 * updateStatementSettingsAction.
 */
export async function updateTurnoverPolicyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("operations.write");
  const organizationId = await requireOrgId();

  const parsed = turnoverPolicySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const data = parsed.data;

  const writableValues = {
    defaultCheckoutTime: data.checkoutTime,
    defaultCheckinTime: data.checkinTime,
    minTurnoverMinutes: data.minTurnoverMinutes,
    updatedAt: new Date(),
    updatedBy: me?.id ?? null,
  };

  const [existing] = await db
    .select({ id: orgTurnoverPolicy.id })
    .from(orgTurnoverPolicy)
    .where(eq(orgTurnoverPolicy.organizationId, organizationId))
    .limit(1);

  if (existing) {
    await db
      .update(orgTurnoverPolicy)
      .set(writableValues)
      .where(eq(orgTurnoverPolicy.organizationId, organizationId));
  } else {
    await db.insert(orgTurnoverPolicy).values({
      organizationId,
      ...writableValues,
    });
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "operations.turnover_policy.update",
    entityType: "org_turnover_policy",
    entityId: existing?.id ?? null,
    metadata: {
      checkoutTime: data.checkoutTime,
      checkinTime: data.checkinTime,
      minTurnoverMinutes: data.minTurnoverMinutes,
    },
  });

  revalidatePath(TURNOVER_POLICY_PATH);
  revalidatePath("/dashboard/operations/turnovers");
  return { ok: true };
}
