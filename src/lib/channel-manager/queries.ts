import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  channelConnections,
  channelReservations,
  channelSyncLog,
  type ChannelName,
  type ChannelConnectionStatus,
} from "@/lib/db/schema/channel-manager";
import { villas } from "@/lib/db/schema/projects";

/**
 * Stage 6.P1.E — read-side queries for the channel manager UI.
 *
 * Pure read queries — every write goes through `actions.ts` so the
 * encryption / audit / sync_log discipline stays in one place.
 *
 * RLS at the DB level keeps per-org isolation honest; we don't filter
 * by organization_id in these queries because the policy already does.
 */

export interface ChannelConnectionListItem {
  id: string;
  villaId: string;
  villaName: string | null;
  villaCode: string | null;
  channel: ChannelName;
  externalPropertyId: string;
  status: ChannelConnectionStatus;
  lastInventorySyncAt: Date | null;
  lastInventorySyncStatus: string | null;
  lastReservationSyncAt: Date | null;
  lastReservationSyncStatus: string | null;
  channelCommissionPct: string | null;
  connectedAt: Date | null;
}

/**
 * List all channel connections, optionally filtered. Joins villa for
 * the name/code so the grid can render without a second roundtrip.
 */
export async function listChannelConnections(filters: {
  channel?: ChannelName;
  villaId?: string;
  status?: ChannelConnectionStatus;
} = {}): Promise<ChannelConnectionListItem[]> {
  const db = getDb();
  if (!db) return [];
  const conds = [] as ReturnType<typeof eq>[];
  if (filters.channel) conds.push(eq(channelConnections.channel, filters.channel));
  if (filters.villaId) conds.push(eq(channelConnections.villaId, filters.villaId));
  if (filters.status) conds.push(eq(channelConnections.status, filters.status));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: channelConnections.id,
      villaId: channelConnections.villaId,
      villaName: villas.name,
      villaCode: villas.unitCode,
      channel: channelConnections.channel,
      externalPropertyId: channelConnections.externalPropertyId,
      status: channelConnections.status,
      lastInventorySyncAt: channelConnections.lastInventorySyncAt,
      lastInventorySyncStatus: channelConnections.lastInventorySyncStatus,
      lastReservationSyncAt: channelConnections.lastReservationSyncAt,
      lastReservationSyncStatus: channelConnections.lastReservationSyncStatus,
      channelCommissionPct: channelConnections.channelCommissionPct,
      connectedAt: channelConnections.connectedAt,
    })
    .from(channelConnections)
    .leftJoin(villas, eq(villas.id, channelConnections.villaId))
    .where(where ?? sql`true`)
    .orderBy(desc(channelConnections.connectedAt));
  return rows as ChannelConnectionListItem[];
}

export async function getChannelConnectionById(id: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Recent sync attempts for a connection — used by the connection
 * detail page's "recent activity" panel. Default 50 newest.
 */
export async function listSyncLogForConnection(
  connectionId: string,
  opts: { limit?: number } = {},
) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(channelSyncLog)
    .where(eq(channelSyncLog.channelConnectionId, connectionId))
    .orderBy(desc(channelSyncLog.triggeredAt))
    .limit(opts.limit ?? 50);
}

export interface ChannelReservationFilters {
  channel?: ChannelName;
  villaId?: string;
  state?: string;
  /** Inclusive lower bound on check_in. */
  fromDate?: string;
  /** Inclusive upper bound on check_out. */
  toDate?: string;
  /** Free-text against guest name + email + external_reservation_id. */
  search?: string;
  limit?: number;
}

export interface ChannelReservationListItem {
  id: string;
  channelConnectionId: string;
  channel: ChannelName;
  villaId: string;
  villaName: string | null;
  villaCode: string | null;
  externalReservationId: string;
  externalStatus: string | null;
  reservationState: string;
  guestFirstName: string | null;
  guestLastName: string | null;
  guestEmail: string | null;
  checkIn: string;
  checkOut: string;
  totalAmountMinor: bigint | null;
  currency: string;
  receivedAt: Date;
  conflictPending: boolean;
  internalBookingId: string | null;
}

/**
 * Unified inbox query. Filters compose AND-style; returns at most
 * `limit` rows (default 100) ordered by received_at DESC.
 *
 * The search filter is intentionally simple — ILIKE across guest name
 * fields. Once volumes grow, this should swap to a tsvector column.
 */
export async function listChannelReservations(
  filters: ChannelReservationFilters = {},
): Promise<ChannelReservationListItem[]> {
  const db = getDb();
  if (!db) return [];
  const conds = [] as ReturnType<typeof eq>[];
  if (filters.channel) {
    conds.push(eq(channelConnections.channel, filters.channel));
  }
  if (filters.villaId) {
    conds.push(eq(channelConnections.villaId, filters.villaId));
  }
  if (filters.state) {
    conds.push(eq(channelReservations.reservationState, filters.state));
  }
  // Date filtering: hand-rolled SQL for date columns.
  const where = conds.length > 0 ? and(...conds) : undefined;

  const search = filters.search?.trim();
  const searchClause = search
    ? sql`(${channelReservations.guestFirstName} ILIKE ${"%" + search + "%"}
        OR ${channelReservations.guestLastName} ILIKE ${"%" + search + "%"}
        OR ${channelReservations.guestEmail} ILIKE ${"%" + search + "%"}
        OR ${channelReservations.externalReservationId} ILIKE ${"%" + search + "%"})`
    : sql`true`;

  const fromClause = filters.fromDate
    ? sql`${channelReservations.checkIn} >= ${filters.fromDate}`
    : sql`true`;
  const toClause = filters.toDate
    ? sql`${channelReservations.checkOut} <= ${filters.toDate}`
    : sql`true`;

  const rows = await db
    .select({
      id: channelReservations.id,
      channelConnectionId: channelReservations.channelConnectionId,
      channel: channelConnections.channel,
      villaId: channelConnections.villaId,
      villaName: villas.name,
      villaCode: villas.unitCode,
      externalReservationId: channelReservations.externalReservationId,
      externalStatus: channelReservations.externalStatus,
      reservationState: channelReservations.reservationState,
      guestFirstName: channelReservations.guestFirstName,
      guestLastName: channelReservations.guestLastName,
      guestEmail: channelReservations.guestEmail,
      checkIn: channelReservations.checkIn,
      checkOut: channelReservations.checkOut,
      totalAmountMinor: channelReservations.totalAmountMinor,
      currency: channelReservations.currency,
      receivedAt: channelReservations.receivedAt,
      conflictPending: channelReservations.conflictPending,
      internalBookingId: channelReservations.internalBookingId,
    })
    .from(channelReservations)
    .innerJoin(
      channelConnections,
      eq(channelConnections.id, channelReservations.channelConnectionId),
    )
    .leftJoin(villas, eq(villas.id, channelConnections.villaId))
    .where(and(where ?? sql`true`, searchClause, fromClause, toClause))
    .orderBy(desc(channelReservations.receivedAt))
    .limit(filters.limit ?? 100);
  return rows as ChannelReservationListItem[];
}

export async function getChannelReservationById(id: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      reservation: channelReservations,
      channel: channelConnections.channel,
      villaId: channelConnections.villaId,
      villaName: villas.name,
      villaCode: villas.unitCode,
    })
    .from(channelReservations)
    .innerJoin(
      channelConnections,
      eq(channelConnections.id, channelReservations.channelConnectionId),
    )
    .leftJoin(villas, eq(villas.id, channelConnections.villaId))
    .where(eq(channelReservations.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Per-channel summary for the platform-overview top strip on the
 * channels page: connected count vs total villas.
 */
export async function getPerChannelSummary(): Promise<
  Array<{ channel: ChannelName; connectedCount: number; activeCount: number }>
> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      channel: channelConnections.channel,
      connectedCount: sql<number>`count(*)::int`,
      activeCount: sql<number>`count(*) FILTER (WHERE ${channelConnections.status} = 'active')::int`,
    })
    .from(channelConnections)
    .groupBy(channelConnections.channel);
  return rows as Array<{
    channel: ChannelName;
    connectedCount: number;
    activeCount: number;
  }>;
}
