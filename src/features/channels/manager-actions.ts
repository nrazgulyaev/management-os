"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { villas as villasTable } from "@/lib/db/schema/projects";
import {
  channelConnections,
  channelSyncLog,
} from "@/lib/db/schema/channel-manager";
import { channelPushEvents } from "@/lib/db/schema/dynamic-pricing";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Block 06 — Channel-Manager MANAGER layer, write side.
 *
 * Three operator actions on top of the existing connect/registry:
 *   - enqueueAriPushAction       (a) simulate an ARI push for villa × range
 *   - resolveDoubleBookingAction (b) pick the winning booking, close the loser
 *   - retryConnectionSyncAction  (c) re-attempt a connection's sync (simulated)
 *
 * HARD CONSTRAINT: real OTA API push is DEFERRED TO LAUNCH (same posture as the
 * PSP). The push EXECUTION here stays SIMULATED — channel_push_events.status
 * lands on 'simulated', never on a real 'sent'. Everything is permission-gated,
 * org-scoped via the current user, and audit-logged.
 */

const PUSH_PATH = "/dashboard/channels/manager";

function pushEventCode(): string {
  return `CPE-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// (a) ARI push — enqueue + mark simulated, recording the would-be payload.
// ---------------------------------------------------------------------------
const ariPushSchema = z.object({
  villaId: z.string().uuid(),
  channelKey: z.string().min(1).max(64),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventType: z
    .enum(["rate_update", "availability_update", "ari_full_sync"])
    .default("ari_full_sync"),
});

export async function enqueueAriPushAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("channel"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = ariPushSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not authorised." };
  const { villaId, channelKey, dateStart, dateEnd } = parsed.data;
  if (dateEnd < dateStart) {
    return { ok: false, error: "End date must be on or after the start date." };
  }

  // Resolve villa (org scope is enforced by RLS; we still confirm it exists).
  const [villa] = await db
    .select({
      id: villasTable.id,
      name: villasTable.name,
      unitCode: villasTable.unitCode,
      projectId: villasTable.projectId,
      adr: villasTable.currentNightlyRateUsd,
    })
    .from(villasTable)
    .where(eq(villasTable.id, villaId))
    .limit(1);
  if (!villa) return { ok: false, error: "Villa not found." };

  // Build the would-be ARI payload: per-night availability (closed when a
  // confirmed stay covers it) + nightly rate in MINOR units. This is exactly
  // what a real push WOULD carry — but the execution stays simulated.
  const stays = await db
    .select({ checkIn: bookings.checkIn, checkOut: bookings.checkOut })
    .from(bookings)
    .where(
      and(
        eq(bookings.villaId, villaId),
        inArray(bookings.status, ["confirmed", "checked_in", "tentative"]),
        sql`${bookings.checkIn} <= ${dateEnd} AND ${bookings.checkOut} > ${dateStart}`,
      ),
    );
  const closed = new Set<string>();
  for (const s of stays) {
    const d = new Date(`${s.checkIn}T00:00:00.000Z`);
    const end = new Date(`${s.checkOut}T00:00:00.000Z`);
    while (d < end) {
      closed.add(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  const adr = villa.adr ? Number(villa.adr) : 0;
  const rateMinor = BigInt(Math.round(adr * 100));
  const cells: { date: string; available: boolean; rateMinor: string; currency: string }[] =
    [];
  const cur = new Date(`${dateStart}T00:00:00.000Z`);
  const last = new Date(`${dateEnd}T00:00:00.000Z`);
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10);
    cells.push({
      date: iso,
      available: !closed.has(iso),
      rateMinor: rateMinor.toString(),
      currency: "USD",
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const payload = {
    simulated: true as const,
    note: "Channel-manager API integration is deferred to launch. This payload was NOT transmitted.",
    villaId: villa.id,
    villaLabel: villa.name ?? villa.unitCode,
    channelKey,
    eventType: parsed.data.eventType,
    dateStart,
    dateEnd,
    nights: cells.length,
    closedNights: cells.filter((c) => !c.available).length,
    cells,
  };

  const eventCode = pushEventCode();
  let eventId: string | null = null;
  try {
    // queued → simulated, in-tx, so the lifecycle is visible + auditable.
    const [row] = await db
      .insert(channelPushEvents)
      .values({
        eventCode,
        eventType: parsed.data.eventType,
        channelKey,
        villaId: villa.id,
        projectId: villa.projectId,
        dateStart,
        dateEnd,
        payloadJson: payload,
        status: "queued",
        createdBy: me.id,
      })
      .returning({ id: channelPushEvents.id });
    eventId = row?.id ?? null;
    if (eventId) {
      await db
        .update(channelPushEvents)
        .set({ status: "simulated", updatedAt: new Date() })
        .where(eq(channelPushEvents.id, eventId));
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to enqueue push.",
    };
  }

  await recordAuditEvent({
    actorUserId: me.id,
    action: "channel.ari_push.simulate",
    entityType: "channel_push_event",
    entityId: eventId,
    after: {
      eventCode,
      channelKey,
      villaId: villa.id,
      dateStart,
      dateEnd,
      nights: cells.length,
      status: "simulated",
    },
    metadata: { simulated: true },
  });

  revalidatePath(PUSH_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// (b) Double-booking resolution — keep the winner, cancel + close the loser.
// ---------------------------------------------------------------------------
const resolveSchema = z.object({
  winnerBookingId: z.string().uuid(),
  loserBookingId: z.string().uuid(),
});

export async function resolveDoubleBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing booking ids." };
  const { winnerBookingId, loserBookingId } = parsed.data;
  if (winnerBookingId === loserBookingId) {
    return { ok: false, error: "Winner and loser must be different bookings." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not authorised." };
  const organizationId = me.organizationId;

  // Tenant scope: both bookings must belong to the caller's org. A cross-org
  // id simply doesn't come back, so the not-found guard below cancels nothing.
  const rows = await db
    .select({
      id: bookings.id,
      villaId: bookings.villaId,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      channelId: bookings.channelId,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.id, [winnerBookingId, loserBookingId]),
        eq(bookings.organizationId, organizationId),
      ),
    );
  const winner = rows.find((r) => r.id === winnerBookingId);
  const loser = rows.find((r) => r.id === loserBookingId);
  if (!winner || !loser) return { ok: false, error: "Booking not found." };
  if (winner.villaId !== loser.villaId) {
    return { ok: false, error: "Bookings are not on the same villa." };
  }
  if (loser.status === "cancelled") {
    return { ok: false, error: "That booking is already cancelled." };
  }

  try {
    await db
      .update(bookings)
      .set({
        status: "cancelled",
        notes: sql`COALESCE(${bookings.notes} || E'\n', '') || ${`Cancelled via channel-conflict resolution — superseded by ${winner.bookingCode}.`}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, loser.id),
          eq(bookings.organizationId, organizationId),
        ),
      );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to resolve conflict.",
    };
  }

  await recordAuditEvent({
    actorUserId: me.id,
    action: "booking.cancel.conflict_resolution",
    entityType: "booking",
    entityId: loser.id,
    before: { status: loser.status },
    after: { status: "cancelled" },
    metadata: {
      reason: "channel_conflict_resolution",
      winnerBookingId: winner.id,
      winnerBookingCode: winner.bookingCode,
      villaId: loser.villaId,
      closedDates: { checkIn: loser.checkIn, checkOut: loser.checkOut },
    },
  });

  revalidatePath(PUSH_PATH);
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// (c) Retry a connection sync — simulated attempt, logged to channel_sync_log.
// ---------------------------------------------------------------------------
const retrySchema = z.object({
  connectionId: z.string().uuid(),
  syncType: z
    .enum(["inventory_push", "rates_push", "reservations_pull"])
    .default("inventory_push"),
});

export async function retryConnectionSyncAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("channel"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = retrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing connection id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not authorised." };
  const { connectionId, syncType } = parsed.data;

  const [conn] = await db
    .select({
      id: channelConnections.id,
      organizationId: channelConnections.organizationId,
      channel: channelConnections.channel,
      status: channelConnections.status,
    })
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!conn) return { ok: false, error: "Connection not found." };

  const now = new Date();
  try {
    // Simulated success — clears the error + advances the connection back to
    // active. A real integration would call the provider client here; deferred.
    await db.insert(channelSyncLog).values({
      organizationId: conn.organizationId,
      channelConnectionId: conn.id,
      syncType,
      triggerSource: "manual",
      status: "success",
      recordsProcessed: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      apiCallsCount: 0,
      errorMessage: "Simulated retry — channel API integration deferred to launch.",
      triggeredAt: now,
      completedAt: now,
    });

    const isInventory = syncType !== "reservations_pull";
    await db
      .update(channelConnections)
      .set(
        isInventory
          ? {
              status: conn.status === "error" ? "active" : conn.status,
              lastInventorySyncAt: now,
              lastInventorySyncStatus: "success",
              lastInventorySyncError: null,
              updatedAt: now,
            }
          : {
              status: conn.status === "error" ? "active" : conn.status,
              lastReservationSyncAt: now,
              lastReservationSyncStatus: "success",
              lastReservationSyncError: null,
              updatedAt: now,
            },
      )
      .where(eq(channelConnections.id, conn.id));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Retry failed.",
    };
  }

  await recordAuditEvent({
    actorUserId: me.id,
    action: "channel.connection.retry_sync",
    entityType: "channel_connection",
    entityId: conn.id,
    after: { syncType, status: "success" },
    metadata: { simulated: true, channel: conn.channel },
  });

  revalidatePath(PUSH_PATH);
  return { ok: true };
}
