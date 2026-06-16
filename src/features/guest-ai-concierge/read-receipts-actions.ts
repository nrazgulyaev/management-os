"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";
import { serviceRequests } from "@/lib/db/schema/operations";
import { hashStayToken } from "@/features/guest-stays/token";
import { getStayByToken } from "@/features/guest-stays/services";
import { canAccessStayWithoutVerification } from "@/features/guest-stays/verification";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  guestMarkReadSchema,
  staffMarkReadSchema,
} from "./read-receipts-schema";
import {
  recordGuestReadReceipts,
  recordStaffReadReceipts,
} from "./read-receipts-services";

export type ReadActionResult = { ok: boolean; marked?: number };

export async function markGuestRepliesReadAction(
  _prev: ReadActionResult | null,
  formData: FormData,
): Promise<ReadActionResult> {
  const parsed = guestMarkReadSchema.safeParse({
    token: formData.get("token"),
    handoffCode: formData.get("handoffCode"),
  });
  if (!parsed.success) return { ok: false };
  const { token, handoffCode } = parsed.data;

  const resolved = await getStayByToken(token);
  if (!resolved.ok) return { ok: false };
  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) return { ok: false };
  const stay = resolved.stay;

  const db = getDb();
  if (!db) return { ok: false };
  // Resolve handoffCode → handoff_id by joining service_requests.
  const [row] = await db
    .select({ handoffId: guestAiHandoffs.id })
    .from(guestAiHandoffs)
    .innerJoin(
      serviceRequests,
      eq(serviceRequests.id, guestAiHandoffs.serviceRequestId),
    )
    .where(eq(serviceRequests.requestCode, handoffCode))
    .limit(1);
  if (!row) return { ok: false };
  const [ownership] = await db
    .select({
      id: guestAiHandoffs.id,
      tokenId: guestAiHandoffs.guestStayTokenId,
    })
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, row.handoffId))
    .limit(1);
  if (!ownership || ownership.tokenId !== stay.tokenId) {
    return { ok: false };
  }
  const result = await recordGuestReadReceipts({
    handoffId: row.handoffId,
    guestStayTokenId: stay.tokenId,
  });
  return { ok: true, marked: result.marked };
}

export async function markStaffRepliesReadAction(
  _prev: ReadActionResult | null,
  formData: FormData,
): Promise<ReadActionResult> {
  await requirePermission("guest_ai.handoff.read");
  const parsed = staffMarkReadSchema.safeParse({
    handoffId: formData.get("handoffId"),
  });
  if (!parsed.success) return { ok: false };

  // Tenancy: verify the target handoff belongs to the caller's org
  // before mutating its read receipts / unread counter. A handoff with
  // a different (non-null) org is a cross-tenant write attempt.
  const organizationId = await requireOrgId();
  const db = getDb();
  if (!db) return { ok: false };
  const [handoff] = await db
    .select({ organizationId: guestAiHandoffs.organizationId })
    .from(guestAiHandoffs)
    .where(eq(guestAiHandoffs.id, parsed.data.handoffId))
    .limit(1);
  if (!handoff) return { ok: false };
  if (
    handoff.organizationId !== null &&
    handoff.organizationId !== organizationId
  ) {
    return { ok: false };
  }

  const me = await getCurrentAppUser();
  const result = await recordStaffReadReceipts({
    handoffId: parsed.data.handoffId,
    appUserId: me?.id ?? null,
  });
  revalidatePath(`/dashboard/guest-ai/handoffs/${parsed.data.handoffId}`);
  return { ok: true, marked: result.marked };
}
