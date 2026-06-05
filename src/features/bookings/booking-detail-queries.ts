import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings, bookingChannels, guests } from "@/lib/db/schema/bookings";
import {
  bookingGuests,
  bookingCharges,
  bookingPayments,
  bookingMeta,
} from "@/lib/db/schema/booking-detail";
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

/* ------------------ booking-detail data layer (0120) ------------------ */

export interface BookingPartyGuest {
  id: string;
  fullName: string;
  role: string; // primary | accompanying | child
  kind: string; // adult | child
  isLeadBooker: boolean;
  ownerVillaCode: string | null;
  ageYears: number | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  idType: string | null;
  idLast4: string | null;
  idVerified: boolean;
}

export async function listBookingParty(
  bookingId: string,
): Promise<BookingPartyGuest[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, bookingId))
    .orderBy(asc(bookingGuests.sortOrder));
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    role: r.role,
    kind: r.kind,
    isLeadBooker: r.isLeadBooker,
    ownerVillaCode: r.ownerVillaCode,
    ageYears: r.ageYears,
    email: r.email,
    phone: r.phone,
    nationality: r.nationality,
    idType: r.idType,
    idLast4: r.idLast4,
    idVerified: r.idVerified,
  }));
}

export interface BookingChargeLine {
  id: string;
  chargeType: string;
  description: string;
  amount: number;
  currency: string;
  note: string | null;
  occurredOn: string | null;
}

export async function listBookingChargeLines(
  bookingId: string,
): Promise<BookingChargeLine[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(bookingCharges)
    .where(eq(bookingCharges.bookingId, bookingId))
    .orderBy(asc(bookingCharges.sortOrder));
  return rows.map((r) => ({
    id: r.id,
    chargeType: r.chargeType,
    description: r.description,
    amount: Number(r.amount),
    currency: r.currency,
    note: r.note,
    occurredOn: r.occurredOn,
  }));
}

export interface BookingPaymentRow {
  provider: string;
  providerPaymentId: string | null;
  method: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  amount: number | null;
  currency: string;
  status: string;
  capturedAt: string | null;
  captureNote: string | null;
}

export async function getBookingPayment(
  bookingId: string,
): Promise<BookingPaymentRow | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(bookingPayments)
    .where(eq(bookingPayments.bookingId, bookingId))
    .orderBy(desc(bookingPayments.createdAt))
    .limit(1);
  if (!r) return null;
  return {
    provider: r.provider,
    providerPaymentId: r.providerPaymentId,
    method: r.method,
    cardBrand: r.cardBrand,
    cardLast4: r.cardLast4,
    amount: r.amount === null ? null : Number(r.amount),
    currency: r.currency,
    status: r.status,
    capturedAt: r.capturedAt ? r.capturedAt.toISOString() : null,
    captureNote: r.captureNote,
  };
}

export interface BookingMetaRow {
  dietary: string | null;
  mobility: string | null;
  opsNotes: string | null;
  syncMessagesAutoReplied: number;
  syncMessagesRouted: number;
  syncLastAt: string | null;
}

export async function getBookingMeta(
  bookingId: string,
): Promise<BookingMetaRow | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(bookingMeta)
    .where(eq(bookingMeta.bookingId, bookingId))
    .limit(1);
  if (!r) return null;
  return {
    dietary: r.dietary,
    mobility: r.mobility,
    opsNotes: r.opsNotes,
    syncMessagesAutoReplied: r.syncMessagesAutoReplied,
    syncMessagesRouted: r.syncMessagesRouted,
    syncLastAt: r.syncLastAt ? r.syncLastAt.toISOString() : null,
  };
}
