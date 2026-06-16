/**
 * Phase 2.3 owner-01 / Packet C PR 1 — getOwnerHome.
 *
 * Aggregates data for the Owner Portal home:
 *   ytdNet              · sum of net-to-owner across YTD statements
 *   pendingStatement?   · most-recent draft/issued
 *   nextStatementDate   · next-period close + 5 days
 *   villas              · ownership_shares × villas summary
 *   upcoming            · next 14d guest stays + owner stays across all owned villas
 *   recentActivity      · 8 newest owner_activity_log entries
 *
 * Cached 5 min via unstable_cache.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings, guests } from "@/lib/db/schema/bookings";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { ownerActivityLog } from "@/lib/db/schema/owner-activity-log";
import {
  getOwnerDashboardKpis,
  listMyStatements,
  listMyVillas,
} from "@/features/owner-portal/owner-portal-queries";
import { maskedGuestLabel } from "@/features/owner-portal/guest-privacy";

export interface OwnerHomeUpcoming {
  id: string;
  href: string;
  dateLabel: string;
  guest: string;
  villaCode: string;
  nights: number;
  state?: string;
}

export interface OwnerHomeVilla {
  id: string;
  href: string;
  code: string;
  name: string;
  bedrooms: number;
  occupancyPct: number;
  netUsd: number;
  location?: string;
  imageUrl?: string | null;
}

export interface OwnerHomeActivity {
  id: string;
  when: string;
  what: string;
}

export interface OwnerHome {
  ytdNetUsd: number;
  pendingStatement?: {
    statementCode: string;
    href: string;
    netUsd: number;
    periodLabel: string;
  } | null;
  nextStatementLabel: string;
  villas: OwnerHomeVilla[];
  upcoming: OwnerHomeUpcoming[];
  recentActivity: OwnerHomeActivity[];
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + "T00:00:00Z");
  const b = new Date(checkOut + "T00:00:00Z");
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function relativeLabel(at: Date): string {
  const ms = Date.now() - at.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return at.toISOString().slice(0, 10);
}

async function readHome(ownerId: string): Promise<OwnerHome> {
  const [kpis, statements, villas] = await Promise.all([
    getOwnerDashboardKpis(ownerId).catch(() => null),
    listMyStatements(ownerId).catch(() => []),
    listMyVillas(ownerId).catch(() => []),
  ]);

  const thisYear = new Date().getFullYear();
  const ytdNetUsd = statements
    .filter((s) => s.periodMonth.startsWith(String(thisYear)))
    .reduce((n, s) => n + Number(s.netToOwnerUsdMinor) / 100, 0);

  const pending = statements.find((s) => s.status === "draft" || s.status === "issued");
  const today = new Date();
  const nextStmt = new Date(today.getFullYear(), today.getMonth() + 1, 5);

  // Live reads for upcoming + recentActivity (Packet C PR 1).
  const db = getDb();
  const villaIds = villas.map((v) => v.villaId);
  const villaCodeById = new Map(villas.map((v) => [v.villaId, v.villaCode ?? "Villa"]));
  let upcoming: OwnerHomeUpcoming[] = [];
  let recentActivity: OwnerHomeActivity[] = [];

  if (db && villaIds.length > 0) {
    const todayIso = today.toISOString().slice(0, 10);
    const horizon = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);

    // Supplementary reads (upcoming + recentActivity) are non-critical: the
    // home page's headline already comes from the guarded Promise.all above.
    // Degrade each sub-read to empty on failure so a transient error (or a
    // partially-migrated tenant missing one of these tables) can't take down
    // the whole home page — mirroring the `.catch()` pattern on the KPI reads.
    const upcomingGuestRows = await db
      .select({
        id: bookings.id,
        villaId: bookings.villaId,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        status: bookings.status,
        bookingCode: bookings.bookingCode,
        guestName: guests.fullName,
      })
      .from(bookings)
      .leftJoin(guests, eq(guests.id, bookings.guestId))
      .where(
        and(
          inArray(bookings.villaId, villaIds),
          inArray(bookings.status, ["confirmed", "checked_in"]),
          gte(bookings.checkIn, todayIso),
        ),
      )
      .orderBy(asc(bookings.checkIn))
      .limit(12)
      .catch(() => []);

    const upcomingStayRows = await db
      .select({
        id: ownerStayRequests.id,
        villaId: ownerStayRequests.villaId,
        checkIn: ownerStayRequests.requestedStart,
        checkOut: ownerStayRequests.requestedEnd,
        status: ownerStayRequests.status,
      })
      .from(ownerStayRequests)
      .where(
        and(
          eq(ownerStayRequests.ownerId, ownerId),
          inArray(ownerStayRequests.villaId, villaIds),
          gte(ownerStayRequests.requestedStart, todayIso),
          or(
            eq(ownerStayRequests.status, "requested"),
            eq(ownerStayRequests.status, "approved"),
            eq(ownerStayRequests.status, "confirmed"),
          ),
        ),
      )
      .orderBy(asc(ownerStayRequests.requestedStart))
      .limit(12)
      .catch(() => []);

    upcoming = [
      ...upcomingGuestRows
        .filter((r) => r.checkIn <= horizon)
        .map<OwnerHomeUpcoming>((r) => ({
          id: `b-${r.id}`,
          href: `/owner/calendar?month=${r.checkIn.slice(0, 7)}`,
          dateLabel: r.checkIn,
          guest: maskedGuestLabel(r.guestName, r.bookingCode),
          villaCode: villaCodeById.get(r.villaId) ?? "Villa",
          nights: nightsBetween(r.checkIn, r.checkOut),
          state: r.status,
        })),
      ...upcomingStayRows
        .filter((r) => r.checkIn <= horizon)
        .map<OwnerHomeUpcoming>((r) => ({
          id: `s-${r.id}`,
          href: `/owner/calendar?month=${r.checkIn.slice(0, 7)}`,
          dateLabel: r.checkIn,
          guest: "Your stay",
          villaCode: villaCodeById.get(r.villaId) ?? "Villa",
          nights: nightsBetween(r.checkIn, r.checkOut),
          state: r.status,
        })),
    ]
      .sort((a, b) => a.dateLabel.localeCompare(b.dateLabel))
      .slice(0, 6);

    const activityRows = await db
      .select({
        id: ownerActivityLog.id,
        subject: ownerActivityLog.subject,
        body: ownerActivityLog.body,
        occurredAt: ownerActivityLog.occurredAt,
      })
      .from(ownerActivityLog)
      .where(eq(ownerActivityLog.ownerId, ownerId))
      .orderBy(desc(ownerActivityLog.occurredAt))
      .limit(8)
      .catch(() => []);

    recentActivity = activityRows.map((r) => ({
      id: r.id,
      when: relativeLabel(new Date(r.occurredAt)),
      what: r.body ? `${r.subject} — ${r.body}` : r.subject,
    }));
  }

  void kpis; // future expansion: occupancy / ADR badges
  return {
    ytdNetUsd,
    pendingStatement: pending
      ? {
          statementCode: pending.statementCode,
          href: `/owner/statements/${pending.statementId}`,
          netUsd: Number(pending.netToOwnerUsdMinor) / 100,
          periodLabel: pending.monthLabel,
        }
      : null,
    nextStatementLabel: nextStmt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    villas: villas.map((v) => ({
      id: v.villaId,
      href: `/owner/villas/${v.villaId}`,
      code: v.villaCode ?? "—",
      name: v.villaName ?? v.villaCode ?? "Villa",
      bedrooms: v.bedrooms,
      occupancyPct: Math.round(v.occupancyPct),
      netUsd: Number(v.mtdNetUsdMinor) / 100,
      location: v.projectName ?? undefined,
      imageUrl: null,
    })),
    upcoming,
    recentActivity,
  };
}

export const getOwnerHome = unstable_cache(readHome, ["owner-home"], { revalidate: 300 });
