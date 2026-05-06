import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestServiceFinanceLinks,
  guestServiceOrderEvents,
  guestServiceOrders,
} from "@/lib/db/schema/guest-services";
import { revenueLines } from "@/lib/db/schema/finance";
import { findLockingPeriod } from "@/features/finance/validation";

export type BridgeOutcome =
  | {
      ok: true;
      status: "bridged" | "skipped_no_charge" | "skipped_already_bridged";
      revenueLineId: string | null;
    }
  | {
      ok: false;
      status: "skipped_locked_period" | "failed";
      reason: string;
    };

/**
 * Idempotently bridge a fulfilled guest service order into `revenue_lines`.
 *
 * Rules:
 *  - Order must be in status `fulfilled`. Otherwise no-op.
 *  - guest_price_minor === 0 → mark `skipped_no_charge`, no revenue row.
 *  - service_date locked / closed → mark `skipped_locked_period`,
 *    surface a clear reason. Operators can backfill via finance adjustments.
 *  - Already-bridged → no-op (idempotency anchor is
 *    `guest_service_finance_links.order_id` UNIQUE).
 *
 * Internal cost stays on the order row — we never write expense_lines for
 * a guest service. Margin analytics live in the order detail / catalog
 * dashboards.
 */
export async function bridgeOrderToFinance(
  orderId: string,
  actorAppUserId: string | null = null,
  reason: string | null = null,
): Promise<BridgeOutcome> {
  const db = getDb();
  if (!db) return { ok: false, status: "failed", reason: "no_db" };

  const [order] = await db
    .select()
    .from(guestServiceOrders)
    .where(eq(guestServiceOrders.id, orderId))
    .limit(1);
  if (!order) {
    return { ok: false, status: "failed", reason: "order_not_found" };
  }
  if (order.status !== "fulfilled") {
    return {
      ok: false,
      status: "failed",
      reason: `order is ${order.status}, not fulfilled`,
    };
  }

  // Idempotency: if a finance link already exists, return its outcome.
  const [existing] = await db
    .select()
    .from(guestServiceFinanceLinks)
    .where(eq(guestServiceFinanceLinks.orderId, orderId))
    .limit(1);
  if (existing && existing.status === "bridged") {
    return {
      ok: true,
      status: "skipped_already_bridged",
      revenueLineId: existing.revenueLineId ?? null,
    };
  }

  const guestPrice = order.guestPriceMinor;
  if (guestPrice === 0n) {
    await upsertFinanceLink({
      orderId,
      status: "skipped_no_charge",
      amountMinor: 0n,
      currency: order.currency,
      reason,
      actorAppUserId,
      revenueLineId: null,
    });
    await db
      .update(guestServiceOrders)
      .set({
        financeBridgeStatus: "skipped_no_charge",
        updatedAt: new Date(),
      })
      .where(eq(guestServiceOrders.id, orderId));
    return {
      ok: true,
      status: "skipped_no_charge",
      revenueLineId: null,
    };
  }

  // Choose the service date for period-lock checks.
  const serviceDate = orderServiceDate(order);
  const conflict = serviceDate
    ? await findLockingPeriod(db, serviceDate)
    : null;
  if (conflict) {
    await upsertFinanceLink({
      orderId,
      status: "skipped_locked_period",
      amountMinor: guestPrice,
      currency: order.currency,
      reason: `Period "${conflict.label}" is ${conflict.status}`,
      actorAppUserId,
      revenueLineId: null,
    });
    await db
      .update(guestServiceOrders)
      .set({
        financeBridgeStatus: "skipped_locked_period",
        updatedAt: new Date(),
      })
      .where(eq(guestServiceOrders.id, orderId));
    return {
      ok: false,
      status: "skipped_locked_period",
      reason: `Period "${conflict.label}" is ${conflict.status}`,
    };
  }

  // Mint the revenue line. `revenue_type` is free text — `'guest_service'`
  // is reserved by ADR-0017.
  const [rev] = await db
    .insert(revenueLines)
    .values({
      bookingId: order.bookingId,
      villaId: order.villaId,
      projectId: order.projectId,
      ownerId: null,
      revenueType: "guest_service",
      description: `Guest service · ${order.orderCode}`,
      amountMinor: guestPrice,
      currency: order.currency,
      serviceDate,
      earnedAt: order.fulfilledAt ?? new Date(),
      source: "guest_service_order",
      sourceReference: order.orderCode,
      visibility: "internal",
      status: "posted",
      createdBy: actorAppUserId,
    })
    .returning({ id: revenueLines.id });

  await upsertFinanceLink({
    orderId,
    status: "bridged",
    amountMinor: guestPrice,
    currency: order.currency,
    reason,
    actorAppUserId,
    revenueLineId: rev!.id,
  });
  await db
    .update(guestServiceOrders)
    .set({
      financeBridgeStatus: "bridged",
      linkedRevenueLineId: rev!.id,
      updatedAt: new Date(),
    })
    .where(eq(guestServiceOrders.id, orderId));
  await db.insert(guestServiceOrderEvents).values({
    orderId,
    eventType: "finance_bridged",
    actorType: actorAppUserId ? "staff" : "system",
    actorAppUserId,
    message: `Bridged ${order.currency} ${guestPrice.toString()} (minor) to revenue_lines.`,
    metadata: { revenueLineId: rev!.id },
  });

  return { ok: true, status: "bridged", revenueLineId: rev!.id };
}

function orderServiceDate(order: {
  requestedDate: string | null;
  fulfilledAt: Date | null;
}): string | null {
  if (order.requestedDate) return order.requestedDate;
  if (order.fulfilledAt) {
    const d = order.fulfilledAt;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

async function upsertFinanceLink(input: {
  orderId: string;
  status: string;
  amountMinor: bigint;
  currency: string;
  reason: string | null;
  actorAppUserId: string | null;
  revenueLineId: string | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [existing] = await db
    .select()
    .from(guestServiceFinanceLinks)
    .where(eq(guestServiceFinanceLinks.orderId, input.orderId))
    .limit(1);
  if (existing) {
    await db
      .update(guestServiceFinanceLinks)
      .set({
        status: input.status,
        amountMinor: input.amountMinor,
        currency: input.currency,
        reason: input.reason,
        revenueLineId: input.revenueLineId,
        updatedAt: new Date(),
      })
      .where(eq(guestServiceFinanceLinks.id, existing.id));
    return;
  }
  await db.insert(guestServiceFinanceLinks).values({
    orderId: input.orderId,
    status: input.status,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    revenueLineId: input.revenueLineId,
    createdBy: input.actorAppUserId,
  });
}
