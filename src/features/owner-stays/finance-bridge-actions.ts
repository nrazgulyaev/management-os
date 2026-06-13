"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { and } from "drizzle-orm";
import {
  bridgePendingOwnerStays,
  createFinanceRowsForOwnerStay,
  reverseFinanceBridgeForOwnerStay,
} from "./finance-bridge";
import { queueOwnerStayNotification } from "./notifications";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.object({ id: z.string().uuid() });
const reverseSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(2).max(500),
});

export async function bridgeOwnerStayRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { status?: string; linkId?: string }> {
  await requirePermission("owner_stay.finance_bridge");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing request id." };
  const me = await getCurrentAppUser();
  const out = await createFinanceRowsForOwnerStay(
    parsed.data.id,
    me?.id ?? null,
    await requireOrgId(),
  );
  if (out.ok && out.status === "bridged") {
    // Owner-facing notification — informational only.
    try {
      await queueOwnerStayNotification(parsed.data.id, "owner_stay.finance_bridged");
    } catch {
      // Never let a notification queue failure roll back the bridge.
    }
  }
  revalidatePath("/dashboard/owner-stays");
  revalidatePath("/dashboard/owner-stays/finance-bridge");
  revalidatePath(`/dashboard/owner-stays/requests/${parsed.data.id}`);
  return out.ok
    ? { ok: true, status: out.status, linkId: out.linkId }
    : { ok: false, error: out.reason ?? "bridge failed" };
}

export async function bridgePendingOwnerStaysAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { checked?: number; bridged?: number; skipped?: number }> {
  void _formData;
  await requirePermission("owner_stay.finance_bridge");
  const me = await getCurrentAppUser();
  const out = await bridgePendingOwnerStays(me?.id ?? null, 50, await requireOrgId());
  const bridged = out.outcomes.filter((o) => o.status === "bridged").length;
  const skipped = out.outcomes.filter((o) =>
    ["skipped_no_charge", "skipped_locked_period"].includes(o.status),
  ).length;
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.finance_bridge.batch",
    entityType: "owner_stay_request",
    entityId: null,
    after: { checked: out.checked, bridged, skipped },
  });
  revalidatePath("/dashboard/owner-stays/finance-bridge");
  return { ok: true, checked: out.checked, bridged, skipped };
}

export async function reverseOwnerStayFinanceBridgeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_stay.finance_bridge");
  const parsed = reverseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id or reason." };
  const me = await getCurrentAppUser();
  const out = await reverseFinanceBridgeForOwnerStay(
    parsed.data.id,
    me?.id ?? null,
    parsed.data.reason,
    await requireOrgId(),
  );
  revalidatePath("/dashboard/owner-stays/finance-bridge");
  revalidatePath(`/dashboard/owner-stays/requests/${parsed.data.id}`);
  return out.ok
    ? { ok: true }
    : { ok: false, error: out.reason ?? "reverse failed" };
}

/**
 * Mark an approved owner stay as completed. The stay's calendar block
 * is left untouched; the finance bridge is *not* run automatically — the
 * admin can decide to bridge separately, which keeps the audit trail
 * crisp.
 */
export async function completeOwnerStayRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_stay.approve");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing request id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: only complete a request in the caller's org (cross-org id → not
  // found) — completing mints the owner-stay's downstream money lifecycle.
  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.id, parsed.data.id),
        eq(ownerStayRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Request not found." };
  if (before.status !== "approved") {
    return {
      ok: false,
      error: `Cannot complete a request in status ${before.status}. Approve it first.`,
    };
  }

  await db
    .update(ownerStayRequests)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ownerStayRequests.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_stay.request.complete",
    entityType: "owner_stay_request",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "completed" },
  });

  // Queue the owner-facing completion notification — best-effort.
  try {
    await queueOwnerStayNotification(parsed.data.id, "owner_stay.completed");
  } catch {
    // ignore — completion still succeeded.
  }

  revalidatePath("/owner/stays");
  revalidatePath("/dashboard/owner-stays");
  revalidatePath(`/dashboard/owner-stays/requests/${parsed.data.id}`);
  return { ok: true };
}
