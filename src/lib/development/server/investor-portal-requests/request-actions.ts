"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { investorPortalRequests } from "@/lib/db/schema/investor-portal-requests";
import {
  investorWallets,
  capitalCommitments,
  investors,
} from "@/lib/db/schema/investor-capital";
import { walletMovements } from "@/lib/db/schema/wallet-movements";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInvestorSession } from "@/lib/investor-portal/session";
import { recordAuditEvent } from "@/features/audit/services";

const REQUEST_TYPES = [
  "withdrawal",
  "reinvest_to_project",
  "transfer_between_projects",
  "capital_call_response",
] as const;

const submitSchema = z.object({
  // NOTE: `investorId` is intentionally NOT trusted from the client. The
  // authoritative investor is resolved from the portal session below; any
  // value passed here is ignored. Kept optional for call-site ergonomics.
  investorId: z.string().uuid().optional(),
  requestType: z.enum(REQUEST_TYPES),
  requestedAmountMinor: z.bigint().positive(),
  currency: z.string().default("USD"),
  sourceProjectId: z.string().uuid().nullable().optional(),
  targetProjectId: z.string().uuid().nullable().optional(),
  relatedDistributionId: z.string().uuid().nullable().optional(),
  relatedCommitmentId: z.string().uuid().nullable().optional(),
  investorNotes: z.string().max(2000).nullable().optional(),
  preferredExecutionDate: z.string().nullable().optional(),
});

/**
 * Submit a new investor portal request. Always lands in `submitted` —
 * no auto-approval, no auto-execution. Operator review required.
 *
 * SECURITY: the investor is resolved from the authenticated portal session
 * (`requireInvestorSession`), NOT from any client-supplied `investorId`.
 * The source commitment / project is ownership-checked against that
 * investor, and the request is balance-validated against the live wallet
 * cash bucket so an LP can't request more than they hold. Audit-logged.
 */
export async function submitInvestorPortalRequest(
  input: z.input<typeof submitSchema>,
) {
  const session = await requireInvestorSession();
  const parsed = submitSchema.parse(input);
  const db = requireDb();

  // TENANT-1: portal (investor) caller — `requireOrgId` is keyed on
  // internal `appUser`, which is absent for portal sessions. Resolve
  // the org via the investor record bound to the session.
  const [investor] = await db
    .select({ organizationId: investors.organizationId })
    .from(investors)
    .where(eq(investors.id, session.investorId))
    .limit(1);
  if (!investor) {
    throw new Error(`investor ${session.investorId} not found`);
  }
  const organizationId = investor.organizationId;

  // OWNERSHIP + BALANCE: for the cash-moving request types resolve the
  // source wallet (by commitment, else by source project) and confirm it
  // belongs to THIS investor with enough available cash. This is the same
  // wallet the operator will later debit on execute, so we validate against
  // it up-front to refuse over-requests at submit time.
  const movesCash =
    parsed.requestType === "withdrawal" ||
    parsed.requestType === "reinvest_to_project" ||
    parsed.requestType === "transfer_between_projects";
  if (movesCash) {
    const [wallet] = parsed.relatedCommitmentId
      ? await db
          .select({
            id: investorWallets.id,
            cash: investorWallets.cashBalanceMinor,
            investorId: capitalCommitments.investorId,
          })
          .from(investorWallets)
          .innerJoin(
            capitalCommitments,
            eq(capitalCommitments.id, investorWallets.commitmentId),
          )
          .where(eq(investorWallets.commitmentId, parsed.relatedCommitmentId))
          .limit(1)
      : parsed.sourceProjectId
        ? await db
            .select({
              id: investorWallets.id,
              cash: investorWallets.cashBalanceMinor,
              investorId: capitalCommitments.investorId,
            })
            .from(investorWallets)
            .innerJoin(
              capitalCommitments,
              eq(capitalCommitments.id, investorWallets.commitmentId),
            )
            .where(
              and(
                eq(capitalCommitments.projectId, parsed.sourceProjectId),
                eq(capitalCommitments.investorId, session.investorId),
              ),
            )
            .limit(1)
        : [undefined];

    if (!wallet) {
      throw new Error("No matching wallet found for this request.");
    }
    if (wallet.investorId !== session.investorId) {
      throw new Error("That commitment does not belong to your account.");
    }
    if (parsed.requestedAmountMinor > wallet.cash) {
      throw new Error("Requested amount exceeds your available cash balance.");
    }
  }

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(investorPortalRequests);
  const year = new Date().getFullYear();
  const seq = String(Number(count ?? "0") + 1).padStart(4, "0");
  const requestCode = `IRQ-${year}-${seq}`;

  const [row] = await db
    .insert(investorPortalRequests)
    .values({
      organizationId,
      investorId: session.investorId,
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

  await recordAuditEvent({
    actorUserId: session.appUserId,
    action: "investor_portal_request.submitted",
    entityType: "investor_portal_request",
    entityId: row.id,
    after: {
      requestCode: row.requestCode,
      requestType: row.requestType,
      requestedAmountMinor: row.requestedAmountMinor.toString(),
      currency: row.currency,
      investorId: session.investorId,
      channel: "investor_portal",
    },
    metadata: {
      note: "LP-submitted wallet request via investor portal — manual review required, no money moves on submit.",
    },
  });

  revalidatePath("/investor-portal/requests");
  return row;
}

const cancelMineSchema = z.object({
  requestId: z.string().uuid(),
});

export type CancelRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

/**
 * LP-scoped cancel — lets the investor who OWNS a request withdraw it
 * before the operator executes. Scoped to the portal session + an explicit
 * `investor_id` filter (cannot touch another investor's request). Refuses
 * to cancel anything past `under_review`. Audit-logged.
 *
 * (Distinct from the operator-only `cancelInvestorPortalRequest` below,
 * which is callable from internal surfaces and scopes by the row's own org.)
 */
export async function cancelMyInvestorPortalRequest(
  input: z.input<typeof cancelMineSchema>,
): Promise<CancelRequestResult> {
  const parsed = cancelMineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const session = await requireInvestorSession();
  const db = requireDb();

  const [current] = await db
    .select({
      id: investorPortalRequests.id,
      status: investorPortalRequests.status,
      organizationId: investorPortalRequests.organizationId,
      requestCode: investorPortalRequests.requestCode,
    })
    .from(investorPortalRequests)
    .where(
      and(
        eq(investorPortalRequests.id, parsed.data.requestId),
        eq(investorPortalRequests.investorId, session.investorId),
      ),
    )
    .limit(1);
  if (!current) return { ok: false, error: "Request not found." };
  if (current.status !== "submitted" && current.status !== "under_review") {
    return {
      ok: false,
      error: `Cannot cancel a request that is already ${current.status.replace(/_/g, " ")}.`,
    };
  }

  await db
    .update(investorPortalRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(investorPortalRequests.id, parsed.data.requestId),
        eq(investorPortalRequests.investorId, session.investorId),
      ),
    );

  await recordAuditEvent({
    actorUserId: session.appUserId,
    action: "investor_portal_request.cancelled_by_investor",
    entityType: "investor_portal_request",
    entityId: current.id,
    before: { status: current.status },
    after: { status: "cancelled", requestCode: current.requestCode },
    metadata: { channel: "investor_portal" },
  });

  revalidatePath("/investor-portal/requests");
  return { ok: true, requestId: current.id };
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
  const organizationId = await requireOrgId();
  const parsed = reviewSchema.parse(input);
  const db = requireDb();

  const [current] = await db
    .select()
    .from(investorPortalRequests)
    .where(
      and(
        eq(investorPortalRequests.id, parsed.requestId),
        eq(investorPortalRequests.organizationId, organizationId),
      ),
    )
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
    .where(
      and(
        eq(investorPortalRequests.id, parsed.requestId),
        eq(investorPortalRequests.organizationId, organizationId),
      ),
    )
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
  const organizationId = await requireOrgId();
  const parsed = executeSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(investorPortalRequests)
      .where(
        and(
          eq(investorPortalRequests.id, parsed.requestId),
          eq(investorPortalRequests.organizationId, organizationId),
        ),
      )
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
        organizationId,
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
      .where(
        and(
          eq(investorWallets.id, walletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      );

    const [executed] = await tx
      .update(investorPortalRequests)
      .set({
        status: "executed",
        executedAt: new Date(),
        relatedWalletMovementId: movement.id,
      })
      .where(
        and(
          eq(investorPortalRequests.id, parsed.requestId),
          eq(investorPortalRequests.organizationId, organizationId),
        ),
      )
      .returning();
    return { request: executed, movement };
  });
}

export async function cancelInvestorPortalRequest(input: {
  requestId: string;
}) {
  const db = requireDb();
  // TENANT-1: no auth gate in the original — callable from both portal
  // and operator surfaces. Scope by the row's own organizationId so the
  // cancel can't bleed across tenants. RLS still enforces caller→row
  // visibility per Stage 4.B.3.
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
    .where(
      and(
        eq(investorPortalRequests.id, input.requestId),
        eq(investorPortalRequests.organizationId, current.organizationId),
      ),
    )
    .returning();
  return row;
}
