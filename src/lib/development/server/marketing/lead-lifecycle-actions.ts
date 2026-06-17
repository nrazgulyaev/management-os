"use server";
import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import {
  ALL_LEAD_LIFECYCLE_STATUSES,
  nextLifecycleStatuses,
  type LeadLifecycleStatus,
} from "./lead-lifecycle-helpers";

const advanceSchema = z.object({
  leadCode: z.string().min(2).max(80),
  newStatus: z.enum(ALL_LEAD_LIFECYCLE_STATUSES as unknown as [string, ...string[]]),
});

export type AdvanceLeadLifecycleResult =
  | { ok: true; newStatus: string }
  | { ok: false; error: string };

/**
 * Advance a marketing lead one lifecycle stage (or close it as
 * lost/disqualified). Org-scoped, internal-only, FSM-guarded (no
 * skipping forward stages, no moving out of a terminal stage), audited.
 */
export async function advanceLeadLifecycle(
  input: z.input<typeof advanceSchema>,
): Promise<AdvanceLeadLifecycleResult> {
  const ctx = await requireInternalUser();
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();

  // TENANCY: the `leads` DB table carries organization_id (migration 0072;
  // see lead-export-queries) but the column is not on the Drizzle table
  // definition, so the read/update go through org-scoped raw SQL — a foreign
  // lead_code simply reads as "not found" before any write.
  const found = await db.execute<{ id: string; lifecycle_status: string }>(sql`
    SELECT id, lifecycle_status
    FROM leads
    WHERE lead_code = ${parsed.data.leadCode}
      AND organization_id = ${organizationId}
    LIMIT 1
  `);
  const [current] = rowsOf<{ id: string; lifecycle_status: string }>(found);
  if (!current) return { ok: false, error: "Lead not found." };

  const allowed = nextLifecycleStatuses(current.lifecycle_status);
  if (!allowed.includes(parsed.data.newStatus as LeadLifecycleStatus)) {
    return {
      ok: false,
      error: `Invalid transition: ${current.lifecycle_status} → ${parsed.data.newStatus}`,
    };
  }

  await db.execute(sql`
    UPDATE leads
    SET lifecycle_status = ${parsed.data.newStatus},
        lifecycle_status_changed_at = now(),
        updated_at = now()
    WHERE id = ${current.id}
      AND organization_id = ${organizationId}
  `);

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "marketing_lead.lifecycle_advance",
    entityType: "lead",
    entityId: current.id,
    before: { lifecycleStatus: current.lifecycle_status },
    after: { lifecycleStatus: parsed.data.newStatus },
    metadata: { organizationId, leadCode: parsed.data.leadCode },
  });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/marketing/leads`);
  revalidatePath(`${DEVELOPMENT_APP_PATH}/marketing/leads/${parsed.data.leadCode}`);
  return { ok: true, newStatus: parsed.data.newStatus };
}
