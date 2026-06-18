"use server";

/**
 * Buyer-scoped KYC submission.
 *
 * `buyers.kycStatus` models a buyer-driven lifecycle
 * (not_started → in_progress → submitted → verified/rejected/expired). The
 * portal lets the buyer move their OWN record `not_started`/`in_progress`
 * → `submitted`; the operator-side `updateBuyerKycStatus` (developer-trusted,
 * requireInternalUser) owns the `verified`/`rejected` decisions.
 *
 * This action DELIBERATELY does not reuse `updateBuyerKycStatus`: that action
 * calls requireInternalUser()/requireOrgId() and accepts an arbitrary buyer id
 * + target status — it would throw for a buyer (a Supabase auth user, not an
 * app_user) and is not ownership-checked for portal use. Here we resolve "who
 * am I" from the buyer session, scope the update to the session buyer id AND
 * their own org, and only ever advance to `submitted`.
 *
 * Security note (NO RLS on the connection): the session gates access and the
 * update is bounded to (id = session.buyerId AND organization_id = own org), so
 * a buyer can never transition another buyer's record.
 */

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyers } from "@/lib/db/schema/buyers";
import { recordAuditEvent } from "@/features/audit/services";

export type BuyerKycSubmitResult = { ok: true } | { ok: false; error: string };

export async function submitBuyerKyc(): Promise<BuyerKycSubmitResult> {
  const session = await getBuyerSession();
  if (!session) return { ok: false, error: "Not authenticated." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // Resolve the session buyer's own org + current status. The update below is
  // bounded to this id + org, so this read is the sole tenant gate.
  const [buyer] = await db
    .select({
      organizationId: buyers.organizationId,
      kycStatus: buyers.kycStatus,
    })
    .from(buyers)
    .where(eq(buyers.id, session.buyerId))
    .limit(1);
  if (!buyer) return { ok: false, error: "Not authenticated." };

  if (buyer.kycStatus === "submitted") {
    return {
      ok: false,
      error: "Your details are already submitted and awaiting review.",
    };
  }
  if (buyer.kycStatus === "verified") {
    return { ok: false, error: "Your identity is already verified." };
  }
  if (buyer.kycStatus !== "not_started" && buyer.kycStatus !== "in_progress") {
    // rejected / expired etc. — an operator must re-open the record first.
    return {
      ok: false,
      error:
        "Your verification needs attention from our team before it can be re-submitted. Your manager will be in touch.",
    };
  }

  const now = new Date();
  const updated = await db
    .update(buyers)
    .set({ kycStatus: "submitted", updatedAt: now })
    .where(
      and(
        eq(buyers.id, session.buyerId),
        eq(buyers.organizationId, buyer.organizationId),
        // Guard against a race: only advance a still-submittable row.
        inArray(buyers.kycStatus, ["not_started", "in_progress"]),
      ),
    )
    .returning({ id: buyers.id });

  if (updated.length === 0) {
    return {
      ok: false,
      error: "Your details are already submitted and awaiting review.",
    };
  }

  await recordAuditEvent({
    actorUserId: null,
    organizationId: buyer.organizationId,
    action: "buyer.kyc_submitted",
    entityType: "buyer",
    entityId: session.buyerId,
    before: { kycStatus: buyer.kycStatus },
    after: { kycStatus: "submitted" },
    metadata: {
      buyerId: session.buyerId,
      buyerCode: session.buyerCode,
      channel: "buyer_portal",
    },
  });

  revalidatePath("/buyer-portal/kyc");
  revalidatePath("/buyer-portal/dashboard");
  return { ok: true };
}
