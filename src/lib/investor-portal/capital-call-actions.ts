"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import {
  capitalCalls,
  capitalCallAllocations,
} from "@/lib/db/schema/capital-calls";
import { recordAuditEvent } from "@/features/audit/services";
import { requireInvestorSession } from "./session";

/**
 * W1c — LP "Confirm wire received" action.
 *
 * MANUAL only. There is NO real payment-service-provider integration; the
 * LP self-reports that they have wired the funds for their slice of a
 * capital call. This stamps `received_at`, `received_usd`, and `wire_ref`
 * on THEIR allocation row only. Finance staff still reconcile against the
 * bank statement on the CFO side — this is an LP-asserted "I have sent the
 * wire" signal, not a settled-funds confirmation. (Real settlement /
 * partial-receipt reconciliation is deferred — see followups.)
 *
 * Scoped to the calling investor via `requireInvestorSession()` and an
 * explicit `investor_id` filter (belt-and-braces with RLS).
 */

const confirmSchema = z.object({
  allocationId: z.string().uuid(),
  wireRef: z.string().trim().min(1, "Wire reference is required").max(120),
});

export type ConfirmWireResult =
  | { ok: true; allocationId: string }
  | { ok: false; error: string };

export async function confirmCapitalCallWireReceived(
  input: z.input<typeof confirmSchema>,
): Promise<ConfirmWireResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requireInvestorSession();
  const db = requireDb();

  // Load the allocation + parent call, scoped to this investor. This both
  // verifies ownership and gives us the figures to stamp.
  const [row] = await db
    .select({
      allocationId: capitalCallAllocations.id,
      callId: capitalCallAllocations.callId,
      allocatedUsd: capitalCallAllocations.allocatedUsd,
      receivedAt: capitalCallAllocations.receivedAt,
      callStatus: capitalCalls.status,
    })
    .from(capitalCallAllocations)
    .innerJoin(capitalCalls, eq(capitalCalls.id, capitalCallAllocations.callId))
    .where(
      and(
        eq(capitalCallAllocations.id, parsed.data.allocationId),
        eq(capitalCallAllocations.investorId, session.investorId),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, error: "Capital call not found." };
  }
  if (row.callStatus === "cancelled") {
    return { ok: false, error: "This capital call has been cancelled." };
  }
  if (row.receivedAt) {
    return { ok: false, error: "This wire has already been confirmed." };
  }

  // Manual confirm: the LP asserts the full allocated amount was wired.
  // received_usd mirrors allocated_usd (no partial-confirm in v1).
  await db
    .update(capitalCallAllocations)
    .set({
      receivedAt: new Date(),
      receivedUsd: row.allocatedUsd,
      wireRef: parsed.data.wireRef,
    })
    .where(
      and(
        eq(capitalCallAllocations.id, parsed.data.allocationId),
        eq(capitalCallAllocations.investorId, session.investorId),
        // Optimistic guard — don't overwrite a concurrently-confirmed row.
        sql`${capitalCallAllocations.receivedAt} IS NULL`,
      ),
    );

  await recordAuditEvent({
    actorUserId: session.appUserId,
    action: "capital_call_allocation.wire_confirmed",
    entityType: "capital_call_allocation",
    entityId: parsed.data.allocationId,
    after: {
      callId: row.callId,
      investorId: session.investorId,
      wireRef: parsed.data.wireRef,
      assertedUsd: row.allocatedUsd,
      channel: "investor_portal_manual",
    },
    metadata: {
      note: "LP self-reported wire via investor portal — manual, not PSP-settled.",
    },
  });

  revalidatePath("/investor-portal/capital-calls");
  revalidatePath(`/investor-portal/capital-calls/${parsed.data.allocationId}`);

  return { ok: true, allocationId: parsed.data.allocationId };
}
