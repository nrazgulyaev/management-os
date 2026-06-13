import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestServiceFulfilments,
  serviceFulfilmentEvents,
  serviceFulfilmentFinanceLinks,
} from "@/lib/db/schema/service-fulfilment";
import {
  guestServiceOrders,
  guestServices,
} from "@/lib/db/schema/guest-services";
import { revenueLines, expenseLines } from "@/lib/db/schema/finance";
import { findLockingPeriod } from "@/features/finance/validation";
import {
  calculateFinanceBridgeAmounts,
  shouldBridgeFinance,
} from "./pricing-pure";

/**
 * Idempotent finance bridge for a completed fulfilment.
 *
 * Rules:
 *  - Fulfilment must be `completed`. Otherwise no-op (`failed` outcome
 *    with reason).
 *  - Both legs zero → `skipped_no_amount`.
 *  - Service-date period closed/locked → `skipped_locked_period`.
 *  - Idempotency anchor: `service_fulfilment_finance_links.fulfilment_id`
 *    UNIQUE. Re-bridging an already-bridged row is a no-op.
 *  - On success: writes a `revenue_lines` row for the guest price and an
 *    `expense_lines` row for the internal cost. Each row's `source` is
 *    `guest_service_fulfilment` and the `sourceReference` carries the
 *    fulfilment code so finance reports stay traceable.
 */

export type FulfilmentBridgeOutcome =
  | {
      ok: true;
      status:
        | "bridged"
        | "skipped_no_amount"
        | "skipped_locked_period"
        | "skipped_already_bridged";
      revenueLineId: string | null;
      expenseLineId: string | null;
    }
  | {
      ok: false;
      status: "failed" | "reversed";
      reason: string;
    };

export async function bridgeFulfilmentToFinance(
  fulfilmentId: string,
  actorAppUserId: string | null = null,
  organizationId: string | null = null,
): Promise<FulfilmentBridgeOutcome> {
  const db = getDb();
  if (!db) return { ok: false, status: "failed", reason: "no_db" };

  const [fulfilment] = await db
    .select()
    .from(guestServiceFulfilments)
    .where(eq(guestServiceFulfilments.id, fulfilmentId))
    .limit(1);
  if (!fulfilment) {
    return { ok: false, status: "failed", reason: "fulfilment_not_found" };
  }
  // Tenant scope: when a caller org is supplied (request-scoped actions),
  // confirm the fulfilment belongs to it via the durable NOT-NULL anchor
  // guest_services.organization_id. A cross-org id reads as not-found so no
  // revenue/expense line can be minted against another tenant's books.
  // (Cron batch passes null → system-wide, unscoped by design.)
  if (organizationId) {
    const [owned] = await db
      .select({ id: guestServiceFulfilments.id })
      .from(guestServiceFulfilments)
      .innerJoin(
        guestServiceOrders,
        eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
      )
      .innerJoin(
        guestServices,
        eq(guestServices.id, guestServiceOrders.serviceId),
      )
      .where(
        and(
          eq(guestServiceFulfilments.id, fulfilmentId),
          eq(guestServices.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!owned) {
      return { ok: false, status: "failed", reason: "fulfilment_not_found" };
    }
  }
  if (!shouldBridgeFinance(fulfilment.status as "completed")) {
    return {
      ok: false,
      status: "failed",
      reason: `fulfilment is ${fulfilment.status}, not completed`,
    };
  }

  // Idempotency: existing bridged link → return as-is.
  const [existing] = await db
    .select()
    .from(serviceFulfilmentFinanceLinks)
    .where(eq(serviceFulfilmentFinanceLinks.fulfilmentId, fulfilmentId))
    .limit(1);
  if (existing && existing.status === "bridged") {
    return {
      ok: true,
      status: "skipped_already_bridged",
      revenueLineId: existing.revenueLineId,
      expenseLineId: existing.expenseLineId,
    };
  }

  const [order] = await db
    .select()
    .from(guestServiceOrders)
    .where(eq(guestServiceOrders.id, fulfilment.orderId))
    .limit(1);
  if (!order) {
    return { ok: false, status: "failed", reason: "order_not_found" };
  }

  const amounts = calculateFinanceBridgeAmounts({
    guestPriceMinor: fulfilment.guestPriceMinor,
    internalCostMinor: fulfilment.internalCostMinor,
  });
  if (!amounts.hasAmount) {
    await upsertFinanceLink(db, {
      fulfilmentId,
      orderId: order.id,
      status: "skipped_no_amount",
      amountRevenueMinor: 0n,
      amountExpenseMinor: 0n,
      currency: fulfilment.currency,
      revenueLineId: null,
      expenseLineId: null,
      errorMessage: null,
      bridgedAt: null,
    });
    await appendBridgeEvent(
      db,
      fulfilmentId,
      "skipped_no_amount",
      actorAppUserId,
    );
    return {
      ok: true,
      status: "skipped_no_amount",
      revenueLineId: null,
      expenseLineId: null,
    };
  }

  const serviceDate = orderServiceDate(order);
  const lockingPeriod = serviceDate
    ? await findLockingPeriod(db, serviceDate)
    : null;
  if (lockingPeriod) {
    await upsertFinanceLink(db, {
      fulfilmentId,
      orderId: order.id,
      status: "skipped_locked_period",
      amountRevenueMinor: amounts.revenueMinor,
      amountExpenseMinor: amounts.expenseMinor,
      currency: fulfilment.currency,
      revenueLineId: null,
      expenseLineId: null,
      errorMessage: `Period locked: ${lockingPeriod.label} is ${lockingPeriod.status}.`,
      bridgedAt: null,
    });
    await appendBridgeEvent(
      db,
      fulfilmentId,
      "skipped_locked_period",
      actorAppUserId,
    );
    return {
      ok: true,
      status: "skipped_locked_period",
      revenueLineId: null,
      expenseLineId: null,
    };
  }

  try {
    const ts = fulfilment.completedAt ?? new Date();
    let revenueLineId: string | null = null;
    let expenseLineId: string | null = null;
    if (amounts.revenueMinor > 0n) {
      const [rev] = await db
        .insert(revenueLines)
        .values({
          bookingId: order.bookingId ?? null,
          villaId: order.villaId ?? null,
          projectId: order.projectId ?? null,
          revenueType: "guest_service",
          description: `Service fulfilment ${fulfilment.fulfilmentCode}`,
          amountMinor: amounts.revenueMinor,
          currency: fulfilment.currency,
          serviceDate: serviceDate ?? null,
          earnedAt: ts,
          source: "guest_service_fulfilment",
          sourceReference: fulfilment.fulfilmentCode,
          visibility: "internal",
          status: "posted",
        })
        .returning({ id: revenueLines.id });
      revenueLineId = rev?.id ?? null;
    }
    if (amounts.expenseMinor > 0n) {
      const [exp] = await db
        .insert(expenseLines)
        .values({
          villaId: order.villaId ?? null,
          projectId: order.projectId ?? null,
          bookingId: order.bookingId ?? null,
          expenseType: "guest_service_vendor",
          description: `Vendor cost for ${fulfilment.fulfilmentCode}`,
          amountMinor: amounts.expenseMinor,
          currency: fulfilment.currency,
          expenseDate: serviceDate ?? new Date().toISOString().slice(0, 10),
          allocationScope: order.bookingId ? "booking" : "villa",
          ownerChargeable: false,
          status: "posted",
        })
        .returning({ id: expenseLines.id });
      expenseLineId = exp?.id ?? null;
    }

    await upsertFinanceLink(db, {
      fulfilmentId,
      orderId: order.id,
      status: "bridged",
      amountRevenueMinor: amounts.revenueMinor,
      amountExpenseMinor: amounts.expenseMinor,
      currency: fulfilment.currency,
      revenueLineId,
      expenseLineId,
      errorMessage: null,
      bridgedAt: ts,
    });

    await db
      .update(guestServiceFulfilments)
      .set({
        marginMinor: amounts.marginMinor,
        updatedAt: new Date(),
      })
      .where(eq(guestServiceFulfilments.id, fulfilmentId));

    await appendBridgeEvent(db, fulfilmentId, "bridged", actorAppUserId, {
      revenueLineId,
      expenseLineId,
      revenueMinor: amounts.revenueMinor.toString(),
      expenseMinor: amounts.expenseMinor.toString(),
    });

    return {
      ok: true,
      status: "bridged",
      revenueLineId,
      expenseLineId,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    await upsertFinanceLink(db, {
      fulfilmentId,
      orderId: order.id,
      status: "failed",
      amountRevenueMinor: amounts.revenueMinor,
      amountExpenseMinor: amounts.expenseMinor,
      currency: fulfilment.currency,
      revenueLineId: null,
      expenseLineId: null,
      errorMessage: message,
      bridgedAt: null,
    });
    await appendBridgeEvent(db, fulfilmentId, "failed", actorAppUserId, {
      error: message,
    });
    return { ok: false, status: "failed", reason: message };
  }
}

export async function bridgePendingFulfilmentsToFinance(
  limit = 50,
  actorAppUserId: string | null = null,
  organizationId: string | null = null,
): Promise<{ processed: number; bridged: number; skipped: number; failed: number }> {
  const db = getDb();
  if (!db) return { processed: 0, bridged: 0, skipped: 0, failed: 0 };
  // When org-scoped (operator action), only sweep this tenant's fulfilments
  // via the guest_services org anchor. Cron passes null → system-wide.
  const completed = await db
    .select({ id: guestServiceFulfilments.id })
    .from(guestServiceFulfilments)
    .innerJoin(
      guestServiceOrders,
      eq(guestServiceOrders.id, guestServiceFulfilments.orderId),
    )
    .innerJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .leftJoin(
      serviceFulfilmentFinanceLinks,
      eq(
        serviceFulfilmentFinanceLinks.fulfilmentId,
        guestServiceFulfilments.id,
      ),
    )
    .where(
      organizationId
        ? and(
            eq(guestServiceFulfilments.status, "completed"),
            eq(guestServices.organizationId, organizationId),
          )
        : eq(guestServiceFulfilments.status, "completed"),
    )
    .limit(limit);
  let bridged = 0;
  let skipped = 0;
  let failed = 0;
  for (const f of completed) {
    const out = await bridgeFulfilmentToFinance(f.id, actorAppUserId, organizationId);
    if (out.ok) {
      if (out.status === "bridged") bridged++;
      else skipped++;
    } else {
      failed++;
    }
  }
  return { processed: completed.length, bridged, skipped, failed };
}

export async function reverseFulfilmentFinanceBridge(
  fulfilmentId: string,
  reason: string,
  actorAppUserId: string | null = null,
): Promise<FulfilmentBridgeOutcome> {
  const db = getDb();
  if (!db) return { ok: false, status: "failed", reason: "no_db" };
  const [link] = await db
    .select()
    .from(serviceFulfilmentFinanceLinks)
    .where(eq(serviceFulfilmentFinanceLinks.fulfilmentId, fulfilmentId))
    .limit(1);
  if (!link || link.status !== "bridged") {
    return { ok: false, status: "failed", reason: "no_active_bridge" };
  }
  const ts = new Date();
  // We don't physically delete the revenue / expense rows — finance
  // policy is append-only. We mark the link as `reversed` and write a
  // compensating event so the bridge UI can reflect the reversal.
  await db
    .update(serviceFulfilmentFinanceLinks)
    .set({
      status: "reversed",
      reversedAt: ts,
      errorMessage: reason,
      updatedAt: ts,
    })
    .where(eq(serviceFulfilmentFinanceLinks.fulfilmentId, fulfilmentId));
  await appendBridgeEvent(db, fulfilmentId, "reversed", actorAppUserId, {
    reason,
  });
  return {
    ok: true,
    status: "skipped_already_bridged", // semantically: nothing more to do
    revenueLineId: link.revenueLineId,
    expenseLineId: link.expenseLineId,
  };
}

// -----------------------------------------------------------------------------
// internals
// -----------------------------------------------------------------------------

interface UpsertLinkInput {
  fulfilmentId: string;
  orderId: string;
  status:
    | "pending"
    | "bridged"
    | "skipped_no_amount"
    | "skipped_locked_period"
    | "failed"
    | "reversed";
  amountRevenueMinor: bigint;
  amountExpenseMinor: bigint;
  currency: string;
  revenueLineId: string | null;
  expenseLineId: string | null;
  errorMessage: string | null;
  bridgedAt: Date | null;
}

async function upsertFinanceLink(
  db: NonNullable<ReturnType<typeof getDb>>,
  input: UpsertLinkInput,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(serviceFulfilmentFinanceLinks)
    .where(
      eq(serviceFulfilmentFinanceLinks.fulfilmentId, input.fulfilmentId),
    )
    .limit(1);
  const now = new Date();
  if (existing) {
    await db
      .update(serviceFulfilmentFinanceLinks)
      .set({
        status: input.status,
        amountRevenueMinor: input.amountRevenueMinor,
        amountExpenseMinor: input.amountExpenseMinor,
        currency: input.currency,
        revenueLineId: input.revenueLineId,
        expenseLineId: input.expenseLineId,
        errorMessage: input.errorMessage,
        bridgedAt: input.bridgedAt,
        updatedAt: now,
      })
      .where(eq(serviceFulfilmentFinanceLinks.id, existing.id));
    return;
  }
  await db.insert(serviceFulfilmentFinanceLinks).values({
    fulfilmentId: input.fulfilmentId,
    orderId: input.orderId,
    status: input.status,
    amountRevenueMinor: input.amountRevenueMinor,
    amountExpenseMinor: input.amountExpenseMinor,
    currency: input.currency,
    revenueLineId: input.revenueLineId,
    expenseLineId: input.expenseLineId,
    errorMessage: input.errorMessage,
    bridgedAt: input.bridgedAt,
  });
}

async function appendBridgeEvent(
  db: NonNullable<ReturnType<typeof getDb>>,
  fulfilmentId: string,
  outcome: "bridged" | "skipped_no_amount" | "skipped_locked_period" | "failed" | "reversed",
  actorAppUserId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(serviceFulfilmentEvents).values({
    fulfilmentId,
    eventType: "finance_bridged",
    actorType: actorAppUserId ? "admin" : "system",
    actorAppUserId,
    title: `Finance bridge: ${outcome}`,
    description: null,
    metadataJson: { outcome, ...(metadata ?? {}) },
  });
}

function orderServiceDate(order: {
  requestedDate: string | null;
  fulfilledAt: Date | null;
  createdAt: Date;
}): string | null {
  if (order.requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(order.requestedDate)) {
    return order.requestedDate;
  }
  if (order.fulfilledAt) {
    return order.fulfilledAt.toISOString().slice(0, 10);
  }
  return order.createdAt.toISOString().slice(0, 10);
}
