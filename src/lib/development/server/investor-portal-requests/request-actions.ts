"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { investorPortalRequests } from "@/lib/db/schema/investor-portal-requests";
import { investorWallets, capitalCommitments } from "@/lib/db/schema/investor-capital";
import { walletMovements } from "@/lib/db/schema/wallet-movements";
import { requireInternalUser } from "@/features/auth/permissions";

const REQUEST_TYPES = [
  "withdrawal",
  "reinvest_to_project",
  "transfer_between_projects",
  "capital_call_response",
] as const;

const submitSchema = z.object({
  investorId: z.string().uuid(),
  requestType: z.enum(REQUEST_TYPES),
  requestedAmountMinor: z.bigint().positive(),
  currency: z.string().default("USD"),
  sourceProjectId: z.string().uuid().nullable().optional(),
  targetProjectId: z.string().uuid().nullable().optional(),
  relatedDistributionId: z.string().uuid().nullable().optional(),
  relatedCommitmentId: z.string().uuid().nullable().optional(),
  investorNotes: z.string().nullable().optional(),
  preferredExecutionDate: z.string().nullable().optional(),
});

/**
 * Submit a new investor portal request. Always lands in `submitted` —
 * no auto-approval, no auto-execution. Operator review required.
 */
export async function submitInvestorPortalRequest(
  input: z.input<typeof submitSchema>,
) {
  // No `requireInternalUser` here — this is a *write* surface for the
  // investor themselves. RLS on the table enforces the investor_id
  // matches `current_investor_id()`.
  const parsed = submitSchema.parse(input);
  const db = requireDb();

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(investorPortalRequests);
  const year = new Date().getFullYear();
  const seq = String(Number(count ?? "0") + 1).padStart(4, "0");
  const requestCode = `IRQ-${year}-${seq}`;

  const [row] = await db
    .insert(investorPortalRequests)
    .values({
      investorId: parsed.investorId,
      requestCode,
      requestType: parsed.requestType,
      requestedAmountMinor: parsed.requestedAmountMinor,
      currency: parsed.currency,
      sourceProjectId: parsed.sourceProjectId ?? null,
      targetProjectId: parsed.targetProjectId ?? null,
      relatedDistributionId: parsed.relatedDistributionId ?? null,
      relatedCommitmentId: parsed.relatedCommitmentId ?? null,
      investorNotes: parsed.investorNotes ?? null,
      preferredExecutionDate: parsed.preferredExecutionDate ?? null,
      status: "submitted",
    })
    .returning();
  return row;
}

const reviewSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["under_review", "approved", "rejected"]),
  approvalNotes: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
});

export async function reviewInvestorPortalRequest(
  input: z.input<typeof reviewSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = reviewSchema.parse(input);
  const db = requireDb();

  const [current] = await db
    .select()
    .from(investorPortalRequests)
    .where(eq(investorPortalRequests.id, parsed.requestId))
    .limit(1);
  if (!current) throw new Error(`request ${parsed.requestId} not found`);

  const validNext: Record<string, string[]> = {
    submitted: ["under_review", "approved", "rejected"],
    under_review: ["approved", "rejected"],
    approved: [],
    rejected: [],
    executed: [],
    cancelled: [],
  };
  if (!validNext[current.status].includes(parsed.decision)) {
    throw new Error(
      `cannot review request in status '${current.status}' to '${parsed.decision}'`,
    );
  }

  const [row] = await db
    .update(investorPortalRequests)
    .set({
      status: parsed.decision,
      reviewedAt: new Date(),
      reviewedBy: ctx.appUser?.id ?? null,
      approvalNotes: parsed.approvalNotes ?? null,
      rejectionReason: parsed.rejectionReason ?? null,
    })
    .where(eq(investorPortalRequests.id, parsed.requestId))
    .returning();
  return row;
}

const executeSchema = z.object({
  requestId: z.string().uuid(),
});

/**
 * Execute an approved request — atomically writes the corresponding
 * `wallet_movement` and links it via `related_wallet_movement_id`.
 * Refuses to execute requests that aren't in `approved` status.
 */
export async function executeInvestorPortalRequest(
  input: z.input<typeof executeSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = executeSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(investorPortalRequests)
      .where(eq(investorPortalRequests.id, parsed.requestId))
      .limit(1);
    if (!request) throw new Error(`request ${parsed.requestId} not found`);
    if (request.status !== "approved") {
      throw new Error(
        `cannot execute request in status '${request.status}' (must be 'approved')`,
      );
    }

    // Find the wallet for this investor. For source-project requests
    // we use the wallet tied to the commitment in that project.
    let walletId: string | null = null;
    if (request.relatedCommitmentId) {
      const [w] = await tx
        .select({ id: investorWallets.id })
        .from(investorWallets)
        .where(eq(investorWallets.commitmentId, request.relatedCommitmentId))
        .limit(1);
      walletId = w?.id ?? null;
    } else if (request.sourceProjectId) {
      const [w] = await tx
        .select({ id: investorWallets.id })
        .from(investorWallets)
        .innerJoin(
          capitalCommitments,
          eq(capitalCommitments.id, investorWallets.commitmentId),
        )
        .where(eq(capitalCommitments.projectId, request.sourceProjectId))
        .limit(1);
      walletId = w?.id ?? null;
    }
    if (!walletId) {
      throw new Error(
        `cannot resolve wallet for investor ${request.investorId} (provide relatedCommitmentId or sourceProjectId)`,
      );
    }

    const movementType =
      request.requestType === "withdrawal"
        ? "withdrawal_executed"
        : request.requestType === "reinvest_to_project"
          ? "reinvestment_out"
          : request.requestType === "transfer_between_projects"
            ? "reinvestment_out"
            : "manual_adjustment";

    const affectsBalance =
      request.requestType === "withdrawal" ? "cash" : "cash";

    const [movement] = await tx
      .insert(walletMovements)
      .values({
        walletId,
        investorId: request.investorId,
        movementType,
        amountMinor: -request.requestedAmountMinor,
        currency: request.currency,
        affectsBalance,
        sourceProjectId: request.sourceProjectId ?? null,
        targetProjectId: request.targetProjectId ?? null,
        relatedCommitmentId: request.relatedCommitmentId ?? null,
        relatedDistributionId: request.relatedDistributionId ?? null,
        status: "recorded",
        effectedBy: ctx.appUser?.id ?? null,
        reason: `executed investor portal request ${request.requestCode}`,
      })
      .returning();

    await tx
      .update(investorWallets)
      .set({
        cashBalanceMinor: sql`${investorWallets.cashBalanceMinor} - ${request.requestedAmountMinor}`,
        lastActivityAt: new Date(),
      })
      .where(eq(investorWallets.id, walletId));

    const [executed] = await tx
      .update(investorPortalRequests)
      .set({
        status: "executed",
        executedAt: new Date(),
        relatedWalletMovementId: movement.id,
      })
      .where(eq(investorPortalRequests.id, parsed.requestId))
      .returning();
    return { request: executed, movement };
  });
}

export async function cancelInvestorPortalRequest(input: {
  requestId: string;
}) {
  const db = requireDb();
  const [current] = await db
    .select()
    .from(investorPortalRequests)
    .where(eq(investorPortalRequests.id, input.requestId))
    .limit(1);
  if (!current) throw new Error(`request ${input.requestId} not found`);
  if (current.status === "executed") {
    throw new Error("cannot cancel executed request");
  }
  const [row] = await db
    .update(investorPortalRequests)
    .set({ status: "cancelled" })
    .where(eq(investorPortalRequests.id, input.requestId))
    .returning();
  return row;
}
