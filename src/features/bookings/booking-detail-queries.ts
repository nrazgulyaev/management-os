import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings, bookingChannels, guests } from "@/lib/db/schema/bookings";
import { villas, projects } from "@/lib/db/schema/projects";
import { owners, ownershipShares } from "@/lib/db/schema/ownership";
import { ownerBookingSummaries } from "@/lib/db/schema/owner-bookings";
import { ownerStatements } from "@/lib/db/schema/finance";
import { channelCalendarEvents } from "@/lib/db/schema/integrations";
import { auditEvents } from "@/lib/db/schema/audit";
import { appUsers } from "@/lib/db/schema/identity";

/**
 * Phase 2.x — Booking detail aggregate.
 *
 * One rich read for the booking detail surface, joining the data the detail
 * mock needs that `getBookingById` (the slim list row) doesn't carry: the
 * guest contact, the villa's project + active owner, the owner-statement the
 * booking settles into, and the last channel-calendar sync. Sections with no
 * backing table (per-line charges, Stripe settlement, named party members)
 * are derived or empty-stated by the page, never fabricated here.
 */

function num(v: string | null): number {
  return v === null ? 0 : Number(v);
}

export interface BookingDetail {
  id: string;
  bookingCode: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number | null;
  children: number | null;
  currency: string;
  grossAmount: number;
  cleaningFeeAmount: number;
  channelFeeAmount: number;
  paymentFeeAmount: number;
  netExpectedAmount: number | null;
  notes: string | null;
  sourceReference: string | null;
  createdAt: string;
  updatedAt: string;
  villaId: string;
  villaCode: string | null;
  villaName: string | null;
  projectId: string | null;
  projectName: string | null;
  channelKey: string | null;
  channelName: string | null;
  guestId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestNationality: string | null;
  owner: {
    name: string;
    model: string;
    startsOn: string | null;
    email: string | null;
  } | null;
  statement: { id: string; code: string; status: string } | null;
  lastSyncedAt: string | null;
}

export async function getBookingDetail(id: string): Promise<BookingDetail | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      b: bookings,
      villaCode: villas.unitCode,
      villaName: villas.name,
      projectId: villas.projectId,
      projectName: projects.name,
      channelKey: bookingChannels.key,
      channelName: bookingChannels.name,
      guestId: guests.id,
      guestName: guests.fullName,
      guestEmail: guests.email,
      guestPhone: guests.phone,
      guestNationality: guests.nationality,
    })
    .from(bookings)
    .innerJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(projects, eq(projects.id, villas.projectId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!row) return null;
  const b = row.b;

  const [ownerRow, stmtRow, syncRow] = await Promise.all([
    db
      .select({
        name: owners.displayName,
        model: ownershipShares.model,
        startsOn: ownershipShares.startsOn,
        email: owners.email,
      })
      .from(ownershipShares)
      .innerJoin(owners, eq(owners.id, ownershipShares.ownerId))
      .where(
        and(
          eq(ownershipShares.villaId, b.villaId),
          eq(ownershipShares.status, "active"),
        ),
      )
      .orderBy(desc(ownershipShares.sharePercent))
      .limit(1)
      .catch(() => []),
    db
      .select({
        id: ownerStatements.id,
        code: ownerStatements.statementCode,
        status: ownerStatements.status,
      })
      .from(ownerBookingSummaries)
      .innerJoin(
        ownerStatements,
        eq(ownerStatements.id, ownerBookingSummaries.statementId),
      )
      .where(eq(ownerBookingSummaries.bookingId, id))
      .limit(1)
      .catch(() => []),
    db
      .select({ lastSeenAt: channelCalendarEvents.lastSeenAt })
      .from(channelCalendarEvents)
      .where(eq(channelCalendarEvents.bookingId, id))
      .orderBy(desc(channelCalendarEvents.lastSeenAt))
      .limit(1)
      .catch(() => []),
  ]);

  const owner = ownerRow[0]
    ? {
        name: ownerRow[0].name,
        model: ownerRow[0].model,
        startsOn: ownerRow[0].startsOn,
        email: ownerRow[0].email,
      }
    : null;

  return {
    id: b.id,
    bookingCode: b.bookingCode,
    status: b.status,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: b.nights,
    adults: b.adults,
    children: b.children,
    currency: b.currency,
    grossAmount: num(b.grossAmount),
    cleaningFeeAmount: num(b.cleaningFeeAmount),
    channelFeeAmount: num(b.channelFeeAmount),
    paymentFeeAmount: num(b.paymentFeeAmount),
    netExpectedAmount: b.netExpectedAmount === null ? null : num(b.netExpectedAmount),
    notes: b.notes,
    sourceReference: b.sourceReference,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    villaId: b.villaId,
    villaCode: row.villaCode ?? null,
    villaName: row.villaName ?? null,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    channelKey: row.channelKey ?? null,
    channelName: row.channelName ?? null,
    guestId: row.guestId ?? null,
    guestName: row.guestName ?? null,
    guestEmail: row.guestEmail ?? null,
    guestPhone: row.guestPhone ?? null,
    guestNationality: row.guestNationality ?? null,
    owner,
    statement: stmtRow[0]
      ? { id: stmtRow[0].id, code: stmtRow[0].code, status: stmtRow[0].status }
      : null,
    lastSyncedAt: syncRow[0]?.lastSeenAt
      ? syncRow[0].lastSeenAt.toISOString()
      : null,
  };
}

export interface BookingAuditRow {
  id: string;
  action: string;
  actorName: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
}

/** Audit timeline scoped to one booking (the shared listAuditEvents ignores
 * its entity filter, so we query the indexed entity columns directly). */
export async function listBookingAuditTimeline(
  bookingId: string,
): Promise<BookingAuditRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ e: auditEvents, actorName: appUsers.fullName })
    .from(auditEvents)
    .leftJoin(appUsers, eq(appUsers.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.entityType, "booking"),
        eq(auditEvents.entityId, bookingId),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.e.id,
    action: r.e.action,
    actorName: r.actorName,
    before: r.e.before,
    after: r.e.after,
    metadata: r.e.metadata,
    createdAt: r.e.createdAt.toISOString(),
  }));
}
