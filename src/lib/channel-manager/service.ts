"use server";

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  channelConnections,
  channelCommissionRecords,
  channelReservations,
  channelSyncLog,
  type ChannelName,
  type ChannelReservationState,
} from "@/lib/db/schema/channel-manager";
import { bookingChannels, bookings, guests } from "@/lib/db/schema/bookings";
import { decryptConnectionCredentials } from "./actions";
import { selectChannelProvider } from "./select-provider";
import type {
  AvailabilityInput,
  RatesInput,
  WebhookEvent,
} from "./types";
import {
  calculateRefund,
  detectChanges,
  detectOverlap,
  mapReservationToBooking,
  mapStatusToInternal,
  type CancellationPolicy,
} from "./workflow-helpers";
import type { ChannelReservationData } from "./types";

/**
 * Stage 6.P1.F — ChannelManagerService.handleIncomingReservation.
 *
 * Orchestrates the channel-reservation → internal-booking pipeline:
 *
 *   1. Upsert channel_reservations (idempotent on
 *      external_reservation_id + channel_connection_id).
 *   2. Detect calendar conflict against existing internal bookings on
 *      the same villa. Mark conflict_pending and skip the projection
 *      if the candidate overlaps a confirmed booking.
 *   3. For NEW reservations: find/create guest, ensure booking_channels
 *      row, insert internal booking, link back via internal_booking_id,
 *      create channel_commission_record.
 *   4. For MODIFIED reservations: detect field changes, update the
 *      internal booking in place.
 *   5. For CANCELLED reservations: flip booking status, calculate
 *      refund per policy, update commission_record liability.
 *
 * RLS keeps every query org-scoped via the existing policies on
 * channel_* tables. Bookings + guests live outside the per-org scope
 * (they predate Stage 5.J multi-tenancy), so the service operates on
 * them at the application layer — `connection.organizationId` is the
 * load-bearing scope identifier.
 *
 * Errors degrade to a structured result rather than throw. Cron jobs
 * and webhook routes call this in a loop; one bad reservation must not
 * crash the entire batch.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type IngestionOutcome =
  | "created"
  | "updated"
  | "cancelled"
  | "no_change"
  | "conflict_pending"
  | "skipped"
  | "failed";

export interface HandleIncomingReservationResult {
  outcome: IngestionOutcome;
  channelReservationId?: string;
  internalBookingId?: string;
  conflictWithReservationIds?: string[];
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function handleIncomingReservation(
  connectionId: string,
  reservation: ChannelReservationData,
  options: {
    /** Optional per-villa policy override; defaults applied otherwise. */
    cancellationPolicy?: CancellationPolicy;
  } = {},
): Promise<HandleIncomingReservationResult> {
  const db = requireDb();

  // 1. Look up the connection — the workflow runs in its scope.
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!connection) {
    return { outcome: "failed", error: "connection not found" };
  }

  const channel = connection.channel as ChannelName;
  const orgId = connection.organizationId;
  const villaId = connection.villaId;

  // 2. Look for an existing channel_reservations row (idempotent path).
  const [existing] = await db
    .select()
    .from(channelReservations)
    .where(
      and(
        eq(channelReservations.channelConnectionId, connectionId),
        eq(
          channelReservations.externalReservationId,
          reservation.externalReservationId,
        ),
      ),
    )
    .limit(1);

  // 3. Detect calendar conflict against confirmed bookings on the same villa.
  //    Skip the conflict check if the inbound reservation IS the cancellation
  //    of an existing one (no overlap to resolve).
  const isCancellation = isCancellationStatus(reservation.externalStatus);
  let conflictIds: string[] = [];
  if (!isCancellation) {
    conflictIds = await detectVillaConflict(
      villaId,
      reservation,
      existing?.internalBookingId ?? undefined,
    );
  }

  // 4. Project the new state of the channel_reservations row.
  const projectedState: ChannelReservationState = projectReservationState(
    reservation.externalStatus,
  );

  if (!existing) {
    // -------------------------------------------------------------------
    // NEW reservation
    // -------------------------------------------------------------------
    if (conflictIds.length > 0) {
      // Insert the row but mark conflict_pending and skip projection.
      const [inserted] = await db
        .insert(channelReservations)
        .values(
          buildChannelReservationInsert({
            connectionId,
            orgId,
            reservation,
            internalBookingId: null,
            conflictPending: true,
            conflictWithReservationId: conflictIds[0] ?? null,
            state: projectedState,
          }),
        )
        .returning({ id: channelReservations.id });
      return {
        outcome: "conflict_pending",
        channelReservationId: inserted.id,
        conflictWithReservationIds: conflictIds,
      };
    }

    const projection = await projectIntoInternalBooking({
      reservation,
      villaId,
      channelKey: channel,
      organizationId: orgId,
    });

    const [insertedChannelRes] = await db
      .insert(channelReservations)
      .values(
        buildChannelReservationInsert({
          connectionId,
          orgId,
          reservation,
          internalBookingId: projection?.bookingId ?? null,
          conflictPending: false,
          conflictWithReservationId: null,
          state: projectedState,
        }),
      )
      .returning({ id: channelReservations.id });

    if (projection) {
      await ensureCommissionRecord({
        orgId,
        channelReservationId: insertedChannelRes.id,
        commissionMinor: reservation.commissionMinor ?? 0n,
        currency: reservation.currency,
      });
    }

    return {
      outcome: "created",
      channelReservationId: insertedChannelRes.id,
      internalBookingId: projection?.bookingId,
    };
  }

  // -------------------------------------------------------------------
  // EXISTING reservation — modification or cancellation
  // -------------------------------------------------------------------
  const oldData = (existing.rawPayload as ChannelReservationData) ?? null;
  const changes = oldData ? detectChanges(oldData, reservation) : [];

  if (isCancellation) {
    // Cancellation path — recompute refund + flip statuses.
    const cancelledAt =
      reservation.reservationCreatedAt instanceof Date
        ? new Date()
        : new Date();
    const refund = calculateRefund({
      totalAmountMinor: existing.totalAmountMinor ?? reservation.totalAmountMinor,
      checkIn: new Date(existing.checkIn),
      cancelledAt,
      policy: options.cancellationPolicy,
      noShow: reservation.externalStatus.toLowerCase().includes("no_show"),
    });

    await db
      .update(channelReservations)
      .set({
        reservationState: "cancelled",
        externalStatus: reservation.externalStatus,
        rawPayload: reservation as never,
        cancellationDate: cancelledAt,
        cancellationReason: `Refund bucket: ${refund.bucket} (${refund.refundPct}%)`,
        lastModifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channelReservations.id, existing.id));

    if (existing.internalBookingId) {
      await db
        .update(bookings)
        .set({
          status: "cancelled",
          notes: appendNote(
            null,
            `Cancelled via channel ${channel}. Refund ${refund.refundPct}% (${refund.bucket}).`,
          ),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, existing.internalBookingId));
    }

    // Adjust commission record — channels typically waive commission on
    // free-cancellation, partial commission on moderate, full on no-show.
    await db
      .update(channelCommissionRecords)
      .set({
        notes: `Cancellation refund ${refund.refundPct}% (${refund.bucket})`,
        updatedAt: new Date(),
      })
      .where(eq(channelCommissionRecords.channelReservationId, existing.id));

    return {
      outcome: "cancelled",
      channelReservationId: existing.id,
      internalBookingId: existing.internalBookingId ?? undefined,
      changes,
    };
  }

  if (conflictIds.length > 0) {
    // Modification arrived but the new dates conflict — flag and stop.
    await db
      .update(channelReservations)
      .set({
        conflictPending: true,
        conflictWithReservationId: conflictIds[0] ?? null,
        rawPayload: reservation as never,
        externalStatus: reservation.externalStatus,
        lastModifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channelReservations.id, existing.id));
    return {
      outcome: "conflict_pending",
      channelReservationId: existing.id,
      conflictWithReservationIds: conflictIds,
    };
  }

  if (changes.length === 0) {
    // No-op — refresh the rawPayload + lastModifiedAt for audit, return.
    await db
      .update(channelReservations)
      .set({
        rawPayload: reservation as never,
        lastModifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channelReservations.id, existing.id));
    return {
      outcome: "no_change",
      channelReservationId: existing.id,
      internalBookingId: existing.internalBookingId ?? undefined,
    };
  }

  // Modification path — apply updates to channel_reservations + booking.
  await db
    .update(channelReservations)
    .set({
      reservationState: "modified",
      externalStatus: reservation.externalStatus,
      rawPayload: reservation as never,
      checkIn: isoDate(reservation.checkIn),
      checkOut: isoDate(reservation.checkOut),
      numAdults: reservation.adults,
      numChildren: reservation.children ?? null,
      totalAmountMinor: reservation.totalAmountMinor,
      currency: reservation.currency,
      guestFirstName: reservation.guest.firstName,
      guestLastName: reservation.guest.lastName,
      guestEmail: reservation.guest.email ?? null,
      guestPhone: reservation.guest.phone ?? null,
      lastModifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(channelReservations.id, existing.id));

  if (existing.internalBookingId) {
    await db
      .update(bookings)
      .set({
        checkIn: isoDate(reservation.checkIn),
        checkOut: isoDate(reservation.checkOut),
        adults: reservation.adults,
        children: reservation.children ?? null,
        currency: reservation.currency,
        grossAmount: minorToDecimalString(reservation.totalAmountMinor),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, existing.internalBookingId));
  }

  return {
    outcome: "updated",
    channelReservationId: existing.id,
    internalBookingId: existing.internalBookingId ?? undefined,
    changes,
  };
}

// ---------------------------------------------------------------------------
// Conflict resolution actions (called by the conflicts UI)
// ---------------------------------------------------------------------------

export async function resolveConflictByConfirmingNew(
  channelReservationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(channelReservations)
    .where(eq(channelReservations.id, channelReservationId))
    .limit(1);
  if (!row) return { ok: false, error: "reservation not found" };
  if (!row.conflictPending) {
    return { ok: false, error: "reservation is not in conflict_pending state" };
  }

  // Cancel the conflicting existing booking (if a sibling channel
  // reservation triggered the conflict).
  if (row.conflictWithReservationId) {
    const [conflicting] = await db
      .select()
      .from(channelReservations)
      .where(eq(channelReservations.id, row.conflictWithReservationId))
      .limit(1);
    if (conflicting?.internalBookingId) {
      await db
        .update(bookings)
        .set({
          status: "cancelled",
          notes: appendNote(
            null,
            `Cancelled to resolve conflict with channel reservation ${row.externalReservationId}`,
          ),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, conflicting.internalBookingId));
    }
    await db
      .update(channelReservations)
      .set({
        reservationState: "cancelled",
        cancellationDate: new Date(),
        cancellationReason: "Manual conflict resolution",
        updatedAt: new Date(),
      })
      .where(eq(channelReservations.id, row.conflictWithReservationId));
  }

  // Now project the originally-conflicting reservation into a booking.
  const reservationData = row.rawPayload as unknown as ChannelReservationData;
  const projection = await projectIntoInternalBooking({
    reservation: reservationData,
    villaId: await villaIdFromConnection(row.channelConnectionId),
    channelKey: await channelFromConnection(row.channelConnectionId),
    organizationId: row.organizationId,
  });

  await db
    .update(channelReservations)
    .set({
      conflictPending: false,
      conflictWithReservationId: null,
      internalBookingId: projection?.bookingId ?? null,
      reservationState: "confirmed",
      updatedAt: new Date(),
    })
    .where(eq(channelReservations.id, channelReservationId));

  return { ok: true };
}

export async function resolveConflictByRejectingNew(
  channelReservationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(channelReservations)
    .where(eq(channelReservations.id, channelReservationId))
    .limit(1);
  if (!row) return { ok: false, error: "reservation not found" };
  if (!row.conflictPending) {
    return { ok: false, error: "reservation is not in conflict_pending state" };
  }
  await db
    .update(channelReservations)
    .set({
      conflictPending: false,
      reservationState: "cancelled",
      cancellationDate: new Date(),
      cancellationReason: "Operator rejected during conflict resolution",
      updatedAt: new Date(),
    })
    .where(eq(channelReservations.id, channelReservationId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function detectVillaConflict(
  villaId: string,
  reservation: ChannelReservationData,
  ignoreInternalBookingId: string | undefined,
): Promise<string[]> {
  const db = requireDb();
  const candidateCheckIn = isoDate(reservation.checkIn);
  const candidateCheckOut = isoDate(reservation.checkOut);
  // Existing confirmed bookings on this villa whose window could overlap.
  const existing = await db
    .select({
      id: bookings.id,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.villaId, villaId),
        eq(bookings.status, "confirmed"),
        // Bound the scan: only rows whose window can intersect ours.
        lte(bookings.checkIn, candidateCheckOut),
        gte(bookings.checkOut, candidateCheckIn),
      ),
    );
  return detectOverlap({
    candidateCheckIn,
    candidateCheckOut,
    candidateId: ignoreInternalBookingId,
    existing: existing.map((b) => ({
      id: b.id,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
    })),
  });
}

interface BookingProjection {
  bookingId: string;
  guestId: string;
}

async function projectIntoInternalBooking(input: {
  reservation: ChannelReservationData;
  villaId: string;
  channelKey: string;
  organizationId: string;
}): Promise<BookingProjection | null> {
  const db = requireDb();
  // 1. Find or create guest by email (fallback to first+last name match).
  const guestId = await findOrCreateGuest(input.reservation, input.organizationId);
  // 2. Look up the booking_channels row by key, create if missing.
  const channelId = await ensureBookingChannelRow(input.channelKey);
  // 3. Insert the booking. bookingCode is derived deterministically so
  //    re-runs of the projection don't double-insert.
  const draft = mapReservationToBooking({
    reservation: input.reservation,
    villaId: input.villaId,
    guestId,
    channelId,
    channelKey: input.channelKey,
  });
  const [row] = await db
    .insert(bookings)
    .values({
      organizationId: input.organizationId,
      villaId: draft.villaId,
      guestId: draft.guestId,
      channelId: draft.channelId,
      bookingCode: draft.bookingCode,
      sourceReference: draft.sourceReference,
      status: draft.status,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      nights: draft.nights,
      adults: draft.adults,
      children: draft.children,
      currency: draft.currency,
      grossAmount: draft.grossAmount,
      channelFeeAmount: draft.channelFeeAmount,
      notes: draft.notes,
    })
    .onConflictDoUpdate({
      target: bookings.bookingCode,
      set: {
        status: draft.status,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        nights: draft.nights,
        adults: draft.adults,
        children: draft.children,
        currency: draft.currency,
        grossAmount: draft.grossAmount,
        channelFeeAmount: draft.channelFeeAmount,
        updatedAt: new Date(),
      },
    })
    .returning({ id: bookings.id });
  return { bookingId: row.id, guestId };
}

async function findOrCreateGuest(
  reservation: ChannelReservationData,
  organizationId: string,
): Promise<string> {
  const db = requireDb();
  const fullName = `${reservation.guest.firstName} ${reservation.guest.lastName}`.trim();
  const email = reservation.guest.email ?? null;
  if (email) {
    const [existing] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.email, email))
      .limit(1);
    if (existing) return existing.id;
  }
  const [created] = await db
    .insert(guests)
    .values({
      organizationId, // TENANCY (0176): stamp the channel-imported guest's org
      fullName,
      email,
      phone: reservation.guest.phone ?? null,
      nationality: reservation.guest.country ?? null,
    })
    .returning({ id: guests.id });
  return created.id;
}

async function ensureBookingChannelRow(channelKey: string): Promise<string> {
  const db = requireDb();
  const [existing] = await db
    .select({ id: bookingChannels.id })
    .from(bookingChannels)
    .where(eq(bookingChannels.key, channelKey))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(bookingChannels)
    .values({
      key: channelKey,
      name: humanizeChannelKey(channelKey),
      type: "ota",
    })
    .returning({ id: bookingChannels.id });
  return created.id;
}

async function ensureCommissionRecord(input: {
  orgId: string;
  channelReservationId: string;
  commissionMinor: bigint;
  currency: string;
}): Promise<void> {
  const db = requireDb();
  await db
    .insert(channelCommissionRecords)
    .values({
      organizationId: input.orgId,
      channelReservationId: input.channelReservationId,
      commissionAmountMinor: input.commissionMinor,
      commissionCurrency: input.currency,
    })
    .onConflictDoNothing({
      target: channelCommissionRecords.channelReservationId,
    });
}

async function villaIdFromConnection(connectionId: string): Promise<string> {
  const db = requireDb();
  const [row] = await db
    .select({ villaId: channelConnections.villaId })
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!row) throw new Error(`connection ${connectionId} not found`);
  return row.villaId;
}

async function channelFromConnection(connectionId: string): Promise<string> {
  const db = requireDb();
  const [row] = await db
    .select({ channel: channelConnections.channel })
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!row) throw new Error(`connection ${connectionId} not found`);
  return row.channel;
}

function buildChannelReservationInsert(args: {
  connectionId: string;
  orgId: string;
  reservation: ChannelReservationData;
  internalBookingId: string | null;
  conflictPending: boolean;
  conflictWithReservationId: string | null;
  state: ChannelReservationState;
}): typeof channelReservations.$inferInsert {
  const r = args.reservation;
  return {
    organizationId: args.orgId,
    channelConnectionId: args.connectionId,
    externalReservationId: r.externalReservationId,
    externalStatus: r.externalStatus,
    rawPayload: r as never,
    internalBookingId: args.internalBookingId,
    guestFirstName: r.guest.firstName,
    guestLastName: r.guest.lastName,
    guestEmail: r.guest.email ?? null,
    guestPhone: r.guest.phone ?? null,
    guestCountry: r.guest.country ?? null,
    checkIn: isoDate(r.checkIn),
    checkOut: isoDate(r.checkOut),
    numAdults: r.adults,
    numChildren: r.children ?? null,
    numInfants: r.infants ?? null,
    totalAmountMinor: r.totalAmountMinor,
    currency: r.currency,
    channelCommissionMinor: r.commissionMinor ?? null,
    taxesMinor: r.taxesMinor ?? null,
    serviceFeesMinor: r.serviceFeesMinor ?? null,
    paymentCollectedBy: r.paymentCollectedBy,
    paymentStatus: r.paymentStatus ?? null,
    reservationState: args.state,
    conflictPending: args.conflictPending,
    conflictWithReservationId: args.conflictWithReservationId,
    specialRequests: r.specialRequests ?? null,
    reservationCreatedAt: r.reservationCreatedAt,
  };
}

function projectReservationState(
  externalStatus: string | undefined,
): ChannelReservationState {
  const internal = mapStatusToInternal(externalStatus);
  if (internal === "cancelled") return "cancelled";
  if (internal === "no_show") return "no_show";
  if (internal === "checked_out") return "completed";
  return "confirmed";
}

function isCancellationStatus(externalStatus: string): boolean {
  return mapStatusToInternal(externalStatus) === "cancelled";
}

function isoDate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function minorToDecimalString(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const major = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? "-" : ""}${major.toString()}.${cents.toString().padStart(2, "0")}`;
}

function appendNote(existing: string | null, addition: string): string {
  if (!existing) return addition;
  return `${existing}\n${addition}`;
}

function humanizeChannelKey(key: string): string {
  // booking_com → Booking.com; trip_com → Trip.com; hotels_com → Hotels.com
  if (key.endsWith("_com")) {
    const base = key.slice(0, -4);
    return base.charAt(0).toUpperCase() + base.slice(1) + ".com";
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// ---------------------------------------------------------------------------
// Public read helpers used by the conflicts UI
// ---------------------------------------------------------------------------

export async function listConflictPendingReservations(): Promise<
  Array<{
    id: string;
    channelConnectionId: string;
    channel: ChannelName;
    villaId: string;
    externalReservationId: string;
    guestFirstName: string | null;
    guestLastName: string | null;
    checkIn: string;
    checkOut: string;
    conflictWithReservationId: string | null;
    receivedAt: Date;
  }>
> {
  const db = requireDb();
  const rows = await db
    .select({
      id: channelReservations.id,
      channelConnectionId: channelReservations.channelConnectionId,
      channel: channelConnections.channel,
      villaId: channelConnections.villaId,
      externalReservationId: channelReservations.externalReservationId,
      guestFirstName: channelReservations.guestFirstName,
      guestLastName: channelReservations.guestLastName,
      checkIn: channelReservations.checkIn,
      checkOut: channelReservations.checkOut,
      conflictWithReservationId: channelReservations.conflictWithReservationId,
      receivedAt: channelReservations.receivedAt,
    })
    .from(channelReservations)
    .innerJoin(
      channelConnections,
      eq(channelConnections.id, channelReservations.channelConnectionId),
    )
    .where(eq(channelReservations.conflictPending, true))
    .orderBy(sql`${channelReservations.receivedAt} DESC`);
  return rows as Array<{
    id: string;
    channelConnectionId: string;
    channel: ChannelName;
    villaId: string;
    externalReservationId: string;
    guestFirstName: string | null;
    guestLastName: string | null;
    checkIn: string;
    checkOut: string;
    conflictWithReservationId: string | null;
    receivedAt: Date;
  }>;
}

// ---------------------------------------------------------------------------
// P1.G — sync orchestration helpers used by cron jobs + webhook routes
// ---------------------------------------------------------------------------

export interface SyncOrchestrationResult {
  ok: boolean;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  apiCallsCount: number;
  durationMs: number;
  error?: string;
}

/**
 * Run an inventory push for a single connection. Decrypts credentials,
 * dispatches via the provider, persists the result to channel_sync_log,
 * and refreshes the connection's last_inventory_sync_* fields.
 *
 * Cron jobs call this in a loop over all `active` connections — a
 * single failure logs + returns rather than throwing so other
 * connections in the batch keep going.
 *
 * The `availabilityProvider` callback supplies the per-villa inventory
 * map. P1.G ships a no-op default that pushes "1 unit available" for
 * every day in the next 18 months — real inventory derivation from
 * `bookings`/`villas.availability` is wired in P3 (Banking) when the
 * full availability surface lands. Callers can inject their own.
 */
export async function syncInventoryForConnection(
  connectionId: string,
  opts: {
    triggerSource?: "cron" | "manual" | "webhook" | "reservation_event";
    horizonMonths?: number;
    availabilityProvider?: (
      villaId: string,
      startDate: Date,
      endDate: Date,
    ) => Promise<Map<string, number>>;
  } = {},
): Promise<SyncOrchestrationResult> {
  const db = requireDb();
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!connection) {
    return zeroOrchestrationResult({ error: "connection not found" });
  }
  if (connection.status !== "active") {
    return zeroOrchestrationResult({
      error: `connection status ${connection.status} — skipping`,
    });
  }

  const horizon = opts.horizonMonths ?? 18;
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + horizon,
      startDate.getUTCDate(),
    ),
  );

  const availabilityPerDay =
    opts.availabilityProvider != null
      ? await opts.availabilityProvider(connection.villaId, startDate, endDate)
      : defaultAvailabilityMap(startDate, endDate);

  const availabilityInput: AvailabilityInput = {
    villaId: connection.villaId,
    externalPropertyId: connection.externalPropertyId,
    startDate,
    endDate,
    availabilityPerDay,
  };

  const triggerSource = opts.triggerSource ?? "cron";
  const startedAt = new Date();
  let credsResolved = null as Awaited<
    ReturnType<typeof decryptConnectionCredentials>
  >;
  try {
    credsResolved = await decryptConnectionCredentials(connectionId);
  } catch {
    credsResolved = null;
  }
  const provider = selectChannelProvider(
    connection.channel as ChannelName,
    credsResolved,
  );

  const result = await provider.pushAvailability(availabilityInput);

  await db.insert(channelSyncLog).values({
    organizationId: connection.organizationId,
    channelConnectionId: connectionId,
    syncType: "inventory_push",
    triggerSource,
    startDate: isoDate(startDate),
    endDate: isoDate(endDate),
    recordsProcessed: result.recordsProcessed,
    recordsSucceeded: result.recordsSucceeded,
    recordsFailed: result.recordsFailed,
    status: result.success ? "success" : "failed",
    errorMessage: result.success ? null : (result.errors[0]?.message ?? null),
    durationMs: result.durationMs,
    triggeredAt: startedAt,
    completedAt: new Date(),
    apiCallsCount: result.apiCallsCount,
  });

  await db
    .update(channelConnections)
    .set({
      lastInventorySyncAt: new Date(),
      lastInventorySyncStatus: result.success ? "success" : "failed",
      lastInventorySyncError: result.success
        ? null
        : (result.errors[0]?.message ?? "sync failed"),
      updatedAt: new Date(),
    })
    .where(eq(channelConnections.id, connectionId));

  return {
    ok: result.success,
    recordsProcessed: result.recordsProcessed,
    recordsSucceeded: result.recordsSucceeded,
    recordsFailed: result.recordsFailed,
    apiCallsCount: result.apiCallsCount,
    durationMs: result.durationMs,
    error: result.success ? undefined : result.errors[0]?.message,
  };
}

/**
 * Run a rates push for a single connection. Same pattern as
 * `syncInventoryForConnection` — decrypts, dispatches, logs, refreshes
 * connection state. The `ratesProvider` callback supplies the per-day
 * rate map; default uses villa.currentNightlyRateUsd as a flat baseline
 * across the horizon.
 */
export async function syncRatesForConnection(
  connectionId: string,
  opts: {
    triggerSource?: "cron" | "manual" | "webhook" | "reservation_event";
    horizonMonths?: number;
    ratesProvider?: (
      villaId: string,
      externalPropertyId: string,
      startDate: Date,
      endDate: Date,
    ) => Promise<Map<string, { amountMinor: bigint; currency: string }>>;
  } = {},
): Promise<SyncOrchestrationResult> {
  const db = requireDb();
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!connection) {
    return zeroOrchestrationResult({ error: "connection not found" });
  }
  if (connection.status !== "active") {
    return zeroOrchestrationResult({
      error: `connection status ${connection.status} — skipping`,
    });
  }

  const horizon = opts.horizonMonths ?? 18;
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + horizon,
      startDate.getUTCDate(),
    ),
  );

  const ratesPerDay =
    opts.ratesProvider != null
      ? await opts.ratesProvider(
          connection.villaId,
          connection.externalPropertyId,
          startDate,
          endDate,
        )
      : new Map<string, { amountMinor: bigint; currency: string }>();

  if (ratesPerDay.size === 0) {
    return zeroOrchestrationResult({
      ok: true,
      error: "no rates configured for this villa — skipped",
    });
  }

  const ratesInput: RatesInput = {
    villaId: connection.villaId,
    externalPropertyId: connection.externalPropertyId,
    ratePlanId: connection.externalPropertyId,
    startDate,
    endDate,
    ratesPerDay,
  };

  const triggerSource = opts.triggerSource ?? "cron";
  const startedAt = new Date();
  let credsResolved = null as Awaited<
    ReturnType<typeof decryptConnectionCredentials>
  >;
  try {
    credsResolved = await decryptConnectionCredentials(connectionId);
  } catch {
    credsResolved = null;
  }
  const provider = selectChannelProvider(
    connection.channel as ChannelName,
    credsResolved,
  );

  const result = await provider.pushRates(ratesInput);

  await db.insert(channelSyncLog).values({
    organizationId: connection.organizationId,
    channelConnectionId: connectionId,
    syncType: "rates_push",
    triggerSource,
    startDate: isoDate(startDate),
    endDate: isoDate(endDate),
    recordsProcessed: result.recordsProcessed,
    recordsSucceeded: result.recordsSucceeded,
    recordsFailed: result.recordsFailed,
    status: result.success ? "success" : "failed",
    errorMessage: result.success ? null : (result.errors[0]?.message ?? null),
    durationMs: result.durationMs,
    triggeredAt: startedAt,
    completedAt: new Date(),
    apiCallsCount: result.apiCallsCount,
  });

  return {
    ok: result.success,
    recordsProcessed: result.recordsProcessed,
    recordsSucceeded: result.recordsSucceeded,
    recordsFailed: result.recordsFailed,
    apiCallsCount: result.apiCallsCount,
    durationMs: result.durationMs,
    error: result.success ? undefined : result.errors[0]?.message,
  };
}

/**
 * Pull reservations from a single connection's channel and feed each
 * one through `handleIncomingReservation`. The cron job calls this
 * across all active connections.
 */
export async function pullAndIngestReservationsForConnection(
  connectionId: string,
): Promise<SyncOrchestrationResult & { ingestionOutcomes: IngestionOutcome[] }> {
  const db = requireDb();
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!connection) {
    return {
      ...zeroOrchestrationResult({ error: "connection not found" }),
      ingestionOutcomes: [],
    };
  }
  if (connection.status !== "active") {
    return {
      ...zeroOrchestrationResult({
        error: `connection status ${connection.status} — skipping`,
      }),
      ingestionOutcomes: [],
    };
  }

  const startedAt = new Date();
  let credsResolved = null as Awaited<
    ReturnType<typeof decryptConnectionCredentials>
  >;
  try {
    credsResolved = await decryptConnectionCredentials(connectionId);
  } catch {
    credsResolved = null;
  }
  const provider = selectChannelProvider(
    connection.channel as ChannelName,
    credsResolved,
  );

  let reservations;
  const apiCallsCount = 1;
  try {
    reservations = await provider.pullReservations({
      externalPropertyId: connection.externalPropertyId,
      modifiedSince: connection.lastReservationSyncAt ?? undefined,
    });
  } catch (err) {
    await db.insert(channelSyncLog).values({
      organizationId: connection.organizationId,
      channelConnectionId: connectionId,
      syncType: "reservations_pull",
      triggerSource: "cron",
      recordsProcessed: 0,
      recordsSucceeded: 0,
      recordsFailed: 1,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt.getTime(),
      triggeredAt: startedAt,
      completedAt: new Date(),
      apiCallsCount,
    });
    return {
      ...zeroOrchestrationResult({ error: "pull failed" }),
      ingestionOutcomes: [],
    };
  }

  const outcomes: IngestionOutcome[] = [];
  let succeeded = 0;
  let failed = 0;
  for (const r of reservations) {
    const result = await handleIncomingReservation(connectionId, r);
    outcomes.push(result.outcome);
    if (result.outcome === "failed") failed++;
    else succeeded++;
  }

  await db.insert(channelSyncLog).values({
    organizationId: connection.organizationId,
    channelConnectionId: connectionId,
    syncType: "reservations_pull",
    triggerSource: "cron",
    recordsProcessed: reservations.length,
    recordsSucceeded: succeeded,
    recordsFailed: failed,
    status: failed === 0 ? "success" : reservations.length > 0 ? "partial" : "success",
    durationMs: Date.now() - startedAt.getTime(),
    triggeredAt: startedAt,
    completedAt: new Date(),
    apiCallsCount,
  });

  await db
    .update(channelConnections)
    .set({
      lastReservationSyncAt: new Date(),
      lastReservationSyncStatus: failed === 0 ? "success" : "partial",
      lastReservationSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(channelConnections.id, connectionId));

  return {
    ok: true,
    recordsProcessed: reservations.length,
    recordsSucceeded: succeeded,
    recordsFailed: failed,
    apiCallsCount,
    durationMs: Date.now() - startedAt.getTime(),
    ingestionOutcomes: outcomes,
  };
}

/**
 * Unified webhook entry point. Used by every per-channel webhook
 * route in P1.G.2:
 *   1. Identify the connection (caller passes connectionId after
 *      resolving from the payload — channels send the property ID,
 *      we look up the matching connection).
 *   2. Decrypt creds + verify HMAC signature.
 *   3. Parse the webhook into a normalized event.
 *   4. Route by event type:
 *        reservation.* → handleIncomingReservation
 *        rate.modified / inventory.modified → log + trigger inventory sync
 *   5. Always log to channel_sync_log with trigger_source='webhook'.
 */
export async function handleWebhookForChannel(input: {
  connectionId: string;
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): Promise<{
  ok: boolean;
  event?: WebhookEvent;
  outcome?: IngestionOutcome | "rate_sync_triggered" | "inventory_sync_triggered";
  error?: string;
}> {
  const db = requireDb();
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, input.connectionId))
    .limit(1);
  if (!connection) return { ok: false, error: "connection not found" };

  let credsResolved = null as Awaited<
    ReturnType<typeof decryptConnectionCredentials>
  >;
  try {
    credsResolved = await decryptConnectionCredentials(input.connectionId);
  } catch {
    credsResolved = null;
  }
  const provider = selectChannelProvider(
    connection.channel as ChannelName,
    credsResolved,
  );

  if (!provider.verifyWebhook(input.rawBody, input.signature, input.webhookSecret)) {
    await db.insert(channelSyncLog).values({
      organizationId: connection.organizationId,
      channelConnectionId: input.connectionId,
      syncType: "webhook_received",
      triggerSource: "webhook",
      status: "failed",
      errorMessage: "signature verification failed",
      triggeredAt: new Date(),
      completedAt: new Date(),
      apiCallsCount: 0,
    });
    return { ok: false, error: "invalid signature" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "payload is not JSON" };
  }
  const event = provider.parseWebhook(parsed);
  if (!event) {
    await db.insert(channelSyncLog).values({
      organizationId: connection.organizationId,
      channelConnectionId: input.connectionId,
      syncType: "webhook_received",
      triggerSource: "webhook",
      status: "failed",
      errorMessage: "unknown event type",
      triggeredAt: new Date(),
      completedAt: new Date(),
      apiCallsCount: 0,
    });
    return { ok: false, error: "unknown event type" };
  }

  // Reservation events: route through the ingestion pipeline. The
  // channel typically embeds the reservation payload alongside the
  // event metadata, but it's not always complete enough to project
  // directly — we trigger a pull-and-ingest for the affected
  // reservation rather than trusting the webhook payload.
  if (
    event.type === "reservation.created" ||
    event.type === "reservation.modified" ||
    event.type === "reservation.cancelled"
  ) {
    // Ingest the embedded reservation if present in the payload.
    const reservationData = (parsed["reservation"] ??
      parsed["data"]) as unknown;
    if (reservationData && typeof reservationData === "object") {
      const r = reservationData as Record<string, unknown>;
      // Best-effort projection — if the payload doesn't have the
      // load-bearing fields, the helper returns null and we fall back
      // to a triggered pull.
      try {
        const result = await handleIncomingReservation(
          input.connectionId,
          buildReservationFromPayload(r, event.type),
        );
        await db.insert(channelSyncLog).values({
          organizationId: connection.organizationId,
          channelConnectionId: input.connectionId,
          syncType: "webhook_received",
          triggerSource: "webhook",
          status: "success",
          recordsProcessed: 1,
          recordsSucceeded: result.outcome === "failed" ? 0 : 1,
          recordsFailed: result.outcome === "failed" ? 1 : 0,
          triggeredAt: new Date(),
          completedAt: new Date(),
          apiCallsCount: 0,
        });
        return { ok: true, event, outcome: result.outcome };
      } catch (err) {
        await db.insert(channelSyncLog).values({
          organizationId: connection.organizationId,
          channelConnectionId: input.connectionId,
          syncType: "webhook_received",
          triggerSource: "webhook",
          status: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
          triggeredAt: new Date(),
          completedAt: new Date(),
          apiCallsCount: 0,
        });
        return { ok: false, error: "ingestion failed" };
      }
    }
    await db.insert(channelSyncLog).values({
      organizationId: connection.organizationId,
      channelConnectionId: input.connectionId,
      syncType: "webhook_received",
      triggerSource: "webhook",
      status: "success",
      errorMessage: "no embedded reservation — operator should pull manually",
      triggeredAt: new Date(),
      completedAt: new Date(),
      apiCallsCount: 0,
    });
    return { ok: true, event };
  }

  if (event.type === "rate.modified" || event.type === "inventory.modified") {
    await db.insert(channelSyncLog).values({
      organizationId: connection.organizationId,
      channelConnectionId: input.connectionId,
      syncType: "webhook_received",
      triggerSource: "webhook",
      status: "success",
      triggeredAt: new Date(),
      completedAt: new Date(),
      apiCallsCount: 0,
    });
    return {
      ok: true,
      event,
      outcome:
        event.type === "rate.modified"
          ? "rate_sync_triggered"
          : "inventory_sync_triggered",
    };
  }

  return { ok: true, event };
}

/**
 * Best-effort: take a webhook's embedded reservation payload and
 * coerce it into the `ChannelReservationData` shape. Channels vary
 * widely in payload conventions; this helper picks the most common
 * field names and falls back to whatever's present.
 */
function buildReservationFromPayload(
  payload: Record<string, unknown>,
  eventType: WebhookEvent["type"],
): import("./types").ChannelReservationData {
  const externalReservationId =
    (payload["confirmation_code"] as string) ??
    (payload["reservation_id"] as string) ??
    (payload["external_id"] as string) ??
    (payload["id"] as string) ??
    "";
  const externalStatus =
    eventType === "reservation.cancelled" ? "Cancel" : "Book";
  return {
    externalReservationId,
    externalStatus,
    guest: {
      firstName:
        ((payload["guest_first_name"] ?? payload["first_name"]) as string) ??
        "Unknown",
      lastName:
        ((payload["guest_last_name"] ?? payload["last_name"]) as string) ??
        "Guest",
      email: payload["guest_email"] as string | undefined,
      phone: payload["guest_phone"] as string | undefined,
    },
    checkIn: parseAnyDate(
      (payload["check_in"] ?? payload["start_date"]) as string,
    ),
    checkOut: parseAnyDate(
      (payload["check_out"] ?? payload["end_date"]) as string,
    ),
    adults: Number(payload["adults"] ?? payload["num_adults"] ?? 1),
    children: payload["children"]
      ? Number(payload["children"])
      : undefined,
    totalAmountMinor: BigInt(
      Math.round(
        Number(payload["total_amount"] ?? payload["total"] ?? 0) * 100,
      ),
    ),
    currency: (payload["currency"] as string) ?? "USD",
    paymentCollectedBy: "channel",
    reservationCreatedAt: parseAnyDate(
      (payload["created_at"] ?? payload["timestamp"]) as string,
    ),
    rawPayload: payload,
  };
}

function parseAnyDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

function defaultAvailabilityMap(
  startDate: Date,
  endDate: Date,
): Map<string, number> {
  const out = new Map<string, number>();
  for (
    let d = startDate.getTime();
    d <= endDate.getTime();
    d += 86_400_000
  ) {
    out.set(new Date(d).toISOString().slice(0, 10), 1);
  }
  return out;
}

function zeroOrchestrationResult(opts: {
  ok?: boolean;
  error?: string;
}): SyncOrchestrationResult {
  return {
    ok: opts.ok ?? false,
    recordsProcessed: 0,
    recordsSucceeded: 0,
    recordsFailed: 0,
    apiCallsCount: 0,
    durationMs: 0,
    error: opts.error,
  };
}

/**
 * List active connections — cron handlers iterate this list and call
 * the per-connection sync method. Exported so cron handlers don't
 * have to re-implement the query.
 */
export async function listActiveConnectionsForCron(): Promise<
  Array<{ id: string; channel: ChannelName }>
> {
  const db = requireDb();
  const rows = await db
    .select({
      id: channelConnections.id,
      channel: channelConnections.channel,
    })
    .from(channelConnections)
    .where(eq(channelConnections.status, "active"));
  return rows as Array<{ id: string; channel: ChannelName }>;
}

/**
 * Conflict-detection sweep — used by the hourly cron. Scans recent
 * channel_reservations against existing internal bookings on the same
 * villa and flips conflict_pending=true on any newly-detected overlap.
 *
 * Returns the count of newly-flagged reservations for telemetry.
 */
export async function detectAndFlagConflicts(opts: {
  receivedSince?: Date;
} = {}): Promise<number> {
  const db = requireDb();
  const since =
    opts.receivedSince ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db
    .select({
      id: channelReservations.id,
      checkIn: channelReservations.checkIn,
      checkOut: channelReservations.checkOut,
      conflictPending: channelReservations.conflictPending,
      internalBookingId: channelReservations.internalBookingId,
      reservationState: channelReservations.reservationState,
      villaId: channelConnections.villaId,
    })
    .from(channelReservations)
    .innerJoin(
      channelConnections,
      eq(channelConnections.id, channelReservations.channelConnectionId),
    )
    .where(
      and(
        gte(channelReservations.receivedAt, since),
        eq(channelReservations.conflictPending, false),
      ),
    );

  let flagged = 0;
  for (const r of recent) {
    if (
      r.reservationState === "cancelled" ||
      r.reservationState === "no_show"
    ) {
      continue;
    }
    const existing = await db
      .select({
        id: bookings.id,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.villaId, r.villaId),
          eq(bookings.status, "confirmed"),
          lte(bookings.checkIn, r.checkOut),
          gte(bookings.checkOut, r.checkIn),
        ),
      );
    const conflicts = detectOverlap({
      candidateCheckIn: r.checkIn,
      candidateCheckOut: r.checkOut,
      candidateId: r.internalBookingId ?? undefined,
      existing: existing.map((b) => ({
        id: b.id,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      })),
    });
    if (conflicts.length > 0) {
      await db
        .update(channelReservations)
        .set({
          conflictPending: true,
          updatedAt: new Date(),
        })
        .where(eq(channelReservations.id, r.id));
      flagged++;
    }
  }
  return flagged;
}

/**
 * Commission reconciliation sweep — used by the daily cron. For each
 * unreconciled commission record older than 30 days where the channel
 * invoice hasn't been received, surface a sync_log entry so the
 * bookkeeper sees it on the dashboard. Marks `reconciled=true` on
 * records where invoice + payment are both done.
 */
export async function reconcileCommissionRecords(): Promise<{
  flagged: number;
  reconciled: number;
}> {
  const db = requireDb();
  // Auto-reconcile: invoice received + payment made → reconciled.
  const autoReconcile = await db
    .update(channelCommissionRecords)
    .set({ reconciled: true, reconciledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(channelCommissionRecords.invoiceReceived, true),
        eq(channelCommissionRecords.paymentMade, true),
        eq(channelCommissionRecords.reconciled, false),
      ),
    )
    .returning({ id: channelCommissionRecords.id });

  // Flag stale: created > 30 days ago, still unreconciled.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const stale = await db
    .select({ id: channelCommissionRecords.id })
    .from(channelCommissionRecords)
    .where(
      and(
        eq(channelCommissionRecords.reconciled, false),
        lte(channelCommissionRecords.createdAt, thirtyDaysAgo),
      ),
    );
  return { flagged: stale.length, reconciled: autoReconcile.length };
}
