import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { bookings, bookingChannels } from "@/lib/db/schema/bookings";
import { villas as villasTable, projects } from "@/lib/db/schema/projects";
import {
  channelConnections,
  channelSyncLog,
  type ChannelName,
} from "@/lib/db/schema/channel-manager";
import { channelPushEvents } from "@/lib/db/schema/dynamic-pricing";

/**
 * Block 06 — Channel-Manager MANAGER layer.
 *
 * The connect/registry + per-villa iCal coverage already exist; this module
 * is the OPERATOR cabinet on top of them:
 *
 *   (a) ARI push grid          — villa × day availability/rate/inventory the
 *                                platform WOULD push; the push EXECUTION stays
 *                                SIMULATED (channel_push_events.status), same
 *                                deferred-to-launch posture as the PSP.
 *   (b) sync-conflict resolver — bookings overlapping across channels on the
 *                                same villa/dates, derived from the real
 *                                bookings table (no new table).
 *   (c) sync-health + retry    — per channel_connection sync state + recent
 *                                attempts from channel_sync_log.
 *
 * Pure read side. Every write goes through actions.ts so the permission /
 * audit / org-scope discipline lives in one place. RLS keeps per-org honest
 * at the DB layer; reads do not re-filter by organization_id.
 */

// ---------------------------------------------------------------------------
// Shared date helpers (UTC-anchored, ISO-day keyed)
// ---------------------------------------------------------------------------
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildDateWindow(anchorIso: string, days: number): string[] {
  const base = new Date(`${anchorIso}T00:00:00.000Z`);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    out.push(isoDay(d));
  }
  return out;
}

/** Inclusive-start / exclusive-end overlap for [aIn,aOut) × [bIn,bOut). */
function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

// ---------------------------------------------------------------------------
// (a) ARI PUSH GRID  — villa × day, what WOULD be pushed
// ---------------------------------------------------------------------------
export interface AriGridCell {
  /** ISO day. */
  date: string;
  /** Available to sell? false when a confirmed booking covers the night. */
  available: boolean;
  /** Nightly rate in MINOR units (bigint serialised as string for the wire). */
  rateMinor: string;
  currency: string;
  /** Booking code occupying the night, when unavailable. */
  bookingCode: string | null;
  /** Most recent push status touching this date, if any. */
  lastPushStatus: string | null;
}

export interface AriGridVilla {
  villaId: string;
  villaName: string;
  unitCode: string;
  /** Base nightly rate in MINOR units, derived from the villa ADR. */
  baseRateMinor: string;
  cells: AriGridCell[];
}

export interface AriGridData {
  dates: string[];
  villas: AriGridVilla[];
  /** Distinct OTA channel keys available as push targets. */
  channelKeys: { key: string; name: string }[];
  anchor: string;
}

export interface GetAriGridInput {
  /** Default 14, max 30. */
  days?: number;
  /** ISO anchor day; defaults to today (UTC). */
  anchor?: string;
}

/**
 * Build the per-villa × day ARI grid. Availability is derived from confirmed
 * bookings (a night with a confirmed/checked-in stay is closed); rate is the
 * villa's current ADR in minor units. The grid is a PREVIEW of the payload a
 * push would carry — no rate engine roundtrip, so it stays cheap to render.
 */
export async function getAriPushGrid(input: GetAriGridInput = {}): Promise<AriGridData> {
  const days = Math.max(1, Math.min(30, input.days ?? 14));
  const anchor = input.anchor ?? isoDay(new Date());
  const dates = buildDateWindow(anchor, days);
  const windowStart = dates[0];
  const windowEnd = dates[dates.length - 1];

  const db = getDb();
  if (!db) {
    return { dates, villas: [], channelKeys: [], anchor };
  }

  // TENANCY: villas have no organization_id — scope via projects. The
  // downstream bookings / push reads inherit the boundary via villaIds.
  const organizationId = await requireOrgId();

  const villaRows = await db
    .select({
      id: villasTable.id,
      name: villasTable.name,
      unitCode: villasTable.unitCode,
      adr: villasTable.currentNightlyRateUsd,
    })
    .from(villasTable)
    .innerJoin(projects, eq(projects.id, villasTable.projectId))
    .where(
      and(
        sql`${villasTable.status} NOT IN ('archived', 'out_of_service')`,
        eq(projects.organizationId, organizationId),
      ),
    )
    .orderBy(villasTable.unitCode);

  if (villaRows.length === 0) {
    return { dates, villas: [], channelKeys: [], anchor };
  }
  const villaIds = villaRows.map((v) => v.id);

  // Confirmed / in-progress stays intersecting the window — close those nights.
  const stayRows = await db
    .select({
      villaId: bookings.villaId,
      bookingCode: bookings.bookingCode,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        inArray(bookings.villaId, villaIds),
        inArray(bookings.status, ["confirmed", "checked_in", "tentative"]),
        sql`${bookings.checkIn} <= ${windowEnd} AND ${bookings.checkOut} > ${windowStart}`,
      ),
    );

  // Most recent push status per (villaId, date) — drives the per-cell badge.
  const pushRows = await db
    .select({
      villaId: channelPushEvents.villaId,
      dateStart: channelPushEvents.dateStart,
      dateEnd: channelPushEvents.dateEnd,
      status: channelPushEvents.status,
      createdAt: channelPushEvents.createdAt,
    })
    .from(channelPushEvents)
    .where(
      and(
        inArray(channelPushEvents.villaId, villaIds),
        sql`${channelPushEvents.dateStart} <= ${windowEnd} AND ${channelPushEvents.dateEnd} >= ${windowStart}`,
      ),
    )
    .orderBy(desc(channelPushEvents.createdAt));

  // villaId → date → bookingCode  (closed nights)
  const closed = new Map<string, Map<string, string>>();
  for (const s of stayRows) {
    const m = closed.get(s.villaId) ?? new Map<string, string>();
    for (const d of dates) {
      if (d >= s.checkIn && d < s.checkOut) m.set(d, s.bookingCode);
    }
    closed.set(s.villaId, m);
  }

  // villaId → date → first (newest) push status seen.
  const pushStatus = new Map<string, Map<string, string>>();
  for (const p of pushRows) {
    if (!p.villaId) continue;
    const m = pushStatus.get(p.villaId) ?? new Map<string, string>();
    for (const d of dates) {
      if (d >= p.dateStart && d <= p.dateEnd && !m.has(d)) m.set(d, p.status);
    }
    pushStatus.set(p.villaId, m);
  }

  const villas: AriGridVilla[] = villaRows.map((v) => {
    const closedForVilla = closed.get(v.id);
    const pushForVilla = pushStatus.get(v.id);
    const adr = v.adr ? Number(v.adr) : 0;
    const baseRateMinor = BigInt(Math.round(adr * 100));
    // current_nightly_rate_usd is USD-denominated by column contract.
    const currency = "USD";
    return {
      villaId: v.id,
      villaName: v.name ?? v.unitCode,
      unitCode: v.unitCode,
      baseRateMinor: baseRateMinor.toString(),
      cells: dates.map((d) => {
        const bookingCode = closedForVilla?.get(d) ?? null;
        return {
          date: d,
          available: !bookingCode,
          rateMinor: baseRateMinor.toString(),
          currency,
          bookingCode,
          lastPushStatus: pushForVilla?.get(d) ?? null,
        };
      }),
    };
  });

  const chanRows = await db
    .select({ key: bookingChannels.key, name: bookingChannels.name })
    .from(bookingChannels)
    .where(and(eq(bookingChannels.type, "ota"), eq(bookingChannels.status, "active")))
    .orderBy(bookingChannels.name);

  return {
    dates,
    villas,
    channelKeys: chanRows.map((c) => ({ key: c.key, name: c.name })),
    anchor,
  };
}

// ---------------------------------------------------------------------------
// (b) SYNC-CONFLICT / DOUBLE-BOOKING DETECTION
// ---------------------------------------------------------------------------
export interface ConflictBookingSide {
  bookingId: string;
  bookingCode: string;
  channelId: string | null;
  channelName: string;
  channelKey: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  grossAmountMinor: string;
  currency: string;
  createdAt: string;
}

export interface DoubleBookingConflict {
  /** Stable key: villaId + sorted booking ids. */
  conflictKey: string;
  villaId: string;
  villaName: string;
  unitCode: string;
  /** Inclusive ISO range of the overlapping nights. */
  overlapStart: string;
  overlapEnd: string;
  overlapNights: number;
  bookings: ConflictBookingSide[];
}

/**
 * Detect double-bookings: confirmed/tentative stays on the SAME villa whose
 * date ranges overlap AND that arrived via DIFFERENT channels (the classic
 * OTA sync race). Pure derivation over the real bookings table — closing a
 * loser's dates is the operator's job, surfaced by resolveDoubleBooking.
 */
export async function detectDoubleBookings(opts: { villaId?: string } = {}): Promise<
  DoubleBookingConflict[]
> {
  const db = getDb();
  if (!db) return [];

  // TENANCY: scope to caller org so cross-org bookings never surface; also
  // shrinks the scan to 0 rows for an empty tenant.
  const organizationId = await requireOrgId();
  const conds = [
    eq(bookings.organizationId, organizationId),
    inArray(bookings.status, ["confirmed", "checked_in", "tentative"]),
  ];
  if (opts.villaId) conds.push(eq(bookings.villaId, opts.villaId));

  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      villaId: bookings.villaId,
      villaName: villasTable.name,
      unitCode: villasTable.unitCode,
      channelId: bookings.channelId,
      channelName: bookingChannels.name,
      channelKey: bookingChannels.key,
      status: bookings.status,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      grossAmount: bookings.grossAmount,
      currency: bookings.currency,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(villasTable, eq(villasTable.id, bookings.villaId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .where(and(...conds))
    .orderBy(bookings.villaId, bookings.checkIn);

  // Group by villa, then pairwise-scan for overlapping cross-channel stays.
  const byVilla = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byVilla.get(r.villaId) ?? [];
    arr.push(r);
    byVilla.set(r.villaId, arr);
  }

  const conflicts: DoubleBookingConflict[] = [];
  for (const [, stays] of byVilla) {
    for (let i = 0; i < stays.length; i++) {
      for (let j = i + 1; j < stays.length; j++) {
        const a = stays[i];
        const b = stays[j];
        if (!rangesOverlap(a.checkIn, a.checkOut, b.checkIn, b.checkOut)) continue;
        // Only flag when the two stays came from DIFFERENT channels — same
        // channel overlaps are the operator's own deliberate edits.
        if (a.channelId && b.channelId && a.channelId === b.channelId) continue;

        const overlapStart = a.checkIn > b.checkIn ? a.checkIn : b.checkIn;
        const overlapEndExcl = a.checkOut < b.checkOut ? a.checkOut : b.checkOut;
        const nights = Math.max(
          0,
          Math.round(
            (Date.parse(`${overlapEndExcl}T00:00:00Z`) -
              Date.parse(`${overlapStart}T00:00:00Z`)) /
              86_400_000,
          ),
        );
        const overlapEndIncl = isoDay(
          new Date(Date.parse(`${overlapEndExcl}T00:00:00Z`) - 86_400_000),
        );
        const sides: ConflictBookingSide[] = [a, b].map((s) => ({
          bookingId: s.bookingId,
          bookingCode: s.bookingCode,
          channelId: s.channelId,
          channelName: s.channelName ?? "Direct / unassigned",
          channelKey: s.channelKey,
          status: s.status,
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          grossAmountMinor: BigInt(
            Math.round(Number(s.grossAmount ?? 0) * 100),
          ).toString(),
          currency: s.currency,
          createdAt: s.createdAt.toISOString(),
        }));
        const ids = [a.bookingId, b.bookingId].sort();
        conflicts.push({
          conflictKey: `${a.villaId}:${ids[0]}:${ids[1]}`,
          villaId: a.villaId,
          villaName: a.villaName ?? a.unitCode,
          unitCode: a.unitCode,
          overlapStart,
          overlapEnd: overlapEndIncl,
          overlapNights: nights,
          bookings: sides,
        });
      }
    }
  }

  // Newest overlap first.
  conflicts.sort((x, y) => (y.overlapStart < x.overlapStart ? -1 : 1));
  return conflicts;
}

// ---------------------------------------------------------------------------
// (c) PER-CONNECTION SYNC-HEALTH + RETRY SURFACE
// ---------------------------------------------------------------------------
export interface ConnectionSyncHealth {
  connectionId: string;
  villaId: string;
  villaName: string | null;
  unitCode: string | null;
  channel: ChannelName;
  status: string;
  lastInventorySyncAt: string | null;
  lastInventorySyncStatus: string | null;
  lastInventorySyncError: string | null;
  lastReservationSyncAt: string | null;
  lastReservationSyncStatus: string | null;
  lastReservationSyncError: string | null;
  /** Failed/partial sync attempts in the recent log window. */
  recentFailures: number;
  /** Health tone derived from status + recent failures. */
  health: "ok" | "warn" | "down";
}

/**
 * Per-connection sync health for the dashboard surface. Joins villa for the
 * label and counts recent failed/partial attempts in channel_sync_log so the
 * operator sees which connections need a retry.
 */
export async function listConnectionSyncHealth(): Promise<ConnectionSyncHealth[]> {
  const db = getDb();
  if (!db) return [];

  // TENANCY: channel_connections carries organization_id — scope so the
  // sync-health surface never lists another org's connections.
  const organizationId = await requireOrgId();

  const conns = await db
    .select({
      id: channelConnections.id,
      villaId: channelConnections.villaId,
      villaName: villasTable.name,
      unitCode: villasTable.unitCode,
      channel: channelConnections.channel,
      status: channelConnections.status,
      lastInventorySyncAt: channelConnections.lastInventorySyncAt,
      lastInventorySyncStatus: channelConnections.lastInventorySyncStatus,
      lastInventorySyncError: channelConnections.lastInventorySyncError,
      lastReservationSyncAt: channelConnections.lastReservationSyncAt,
      lastReservationSyncStatus: channelConnections.lastReservationSyncStatus,
      lastReservationSyncError: channelConnections.lastReservationSyncError,
    })
    .from(channelConnections)
    .leftJoin(villasTable, eq(villasTable.id, channelConnections.villaId))
    .where(
      and(
        eq(channelConnections.organizationId, organizationId),
        sql`${channelConnections.status} <> 'archived'`,
      ),
    )
    .orderBy(channelConnections.channel);

  if (conns.length === 0) return [];

  const failureRows = await db
    .select({
      connectionId: channelSyncLog.channelConnectionId,
      n: sql<number>`count(*)::int`,
    })
    .from(channelSyncLog)
    .where(
      and(
        eq(channelSyncLog.organizationId, organizationId),
        inArray(
          channelSyncLog.channelConnectionId,
          conns.map((c) => c.id),
        ),
        inArray(channelSyncLog.status, ["failed", "partial"]),
        sql`${channelSyncLog.triggeredAt} > now() - interval '7 days'`,
      ),
    )
    .groupBy(channelSyncLog.channelConnectionId);
  const failuresById = new Map(failureRows.map((r) => [r.connectionId, r.n]));

  return conns.map((c) => {
    const recentFailures = failuresById.get(c.id) ?? 0;
    const broken =
      c.status === "error" ||
      c.lastInventorySyncStatus === "failed" ||
      c.lastReservationSyncStatus === "failed";
    const health: ConnectionSyncHealth["health"] = broken
      ? "down"
      : recentFailures > 0 || c.status === "paused"
        ? "warn"
        : "ok";
    return {
      connectionId: c.id,
      villaId: c.villaId,
      villaName: c.villaName,
      unitCode: c.unitCode,
      channel: c.channel as ChannelName,
      status: c.status,
      lastInventorySyncAt: c.lastInventorySyncAt?.toISOString() ?? null,
      lastInventorySyncStatus: c.lastInventorySyncStatus,
      lastInventorySyncError: c.lastInventorySyncError,
      lastReservationSyncAt: c.lastReservationSyncAt?.toISOString() ?? null,
      lastReservationSyncStatus: c.lastReservationSyncStatus,
      lastReservationSyncError: c.lastReservationSyncError,
      recentFailures,
      health,
    };
  });
}
