import "server-only";

import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema/contacts";
import { projects, villas } from "@/lib/db/schema/projects";
import {
  reservations,
  type Reservation,
} from "@/lib/db/schema/sales";
import type {
  ReservationDetail,
  ReservationListItem,
} from "@/lib/development/types/reservations";

export type {
  ReservationDetail,
  ReservationListItem,
} from "@/lib/development/types/reservations";

interface JoinedRow {
  reservation: Reservation;
  contactFullName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  villaCode: string;
  villaName: string | null;
  projectName: string;
  projectSlug: string;
}

function rowToListItem(r: JoinedRow): ReservationListItem {
  return {
    id: r.reservation.id,
    contactId: r.reservation.contactId,
    contactFullName: r.contactFullName,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    villaId: r.reservation.villaId,
    villaCode: r.villaCode,
    villaName: r.villaName,
    projectId: r.reservation.projectId,
    projectName: r.projectName,
    projectSlug: r.projectSlug,
    reservationFeeUsdMinor: r.reservation.reservationFeeUsdMinor,
    reservationFeeIdrMinor: r.reservation.reservationFeeIdrMinor,
    paymentMethod:
      r.reservation.paymentMethod as ReservationListItem["paymentMethod"],
    paymentReference: r.reservation.paymentReference,
    paidAt: r.reservation.paidAt
      ? r.reservation.paidAt.toISOString()
      : null,
    status: r.reservation.status as ReservationListItem["status"],
    expiresAt: r.reservation.expiresAt
      ? r.reservation.expiresAt.toISOString()
      : null,
    priceLockedUsdMinor: r.reservation.priceLockedUsdMinor,
    notes: r.reservation.notes,
    createdAt:
      r.reservation.createdAt instanceof Date
        ? r.reservation.createdAt.toISOString()
        : String(r.reservation.createdAt),
    cancelledAt: r.reservation.cancelledAt
      ? r.reservation.cancelledAt.toISOString()
      : null,
    cancelledReason: r.reservation.cancelledReason,
  };
}

export interface ReservationFilters {
  projectId?: string;
  status?: ReservationListItem["status"];
  expiringWithinDays?: number;
}

export async function getReservations(
  filters: ReservationFilters = {},
): Promise<ReservationListItem[]> {
  const db = getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.projectId)
    conditions.push(eq(reservations.projectId, filters.projectId));
  if (filters.status) conditions.push(eq(reservations.status, filters.status));

  const rows = await db
    .select({
      reservation: reservations,
      contactFullName: contacts.fullName,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      villaCode: villas.unitCode,
      villaName: villas.name,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(reservations)
    .innerJoin(contacts, eq(contacts.id, reservations.contactId))
    .innerJoin(villas, eq(villas.id, reservations.villaId))
    .innerJoin(projects, eq(projects.id, reservations.projectId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reservations.createdAt));

  let mapped = rows.map(rowToListItem);

  if (filters.expiringWithinDays !== undefined) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + filters.expiringWithinDays);
    mapped = mapped.filter((r) => {
      if (r.status !== "active" && r.status !== "pending_payment") return false;
      if (!r.expiresAt) return false;
      return new Date(r.expiresAt).getTime() <= cutoff.getTime();
    });
  }

  return mapped;
}

export async function getProjectReservations(
  projectId: string,
): Promise<ReservationListItem[]> {
  return getReservations({ projectId });
}

export async function getReservationById(
  id: string,
): Promise<ReservationDetail | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      reservation: reservations,
      contactFullName: contacts.fullName,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      villaCode: villas.unitCode,
      villaName: villas.name,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(reservations)
    .innerJoin(contacts, eq(contacts.id, reservations.contactId))
    .innerJoin(villas, eq(villas.id, reservations.villaId))
    .innerJoin(projects, eq(projects.id, reservations.projectId))
    .where(eq(reservations.id, id))
    .limit(1);

  if (!row) return null;

  const base = rowToListItem(row);
  return {
    ...base,
    contactRoleId: row.reservation.contactRoleId,
    fxRateAtReservation: Number(row.reservation.fxRateAtReservation),
    refundedAmountUsdMinor: row.reservation.refundedAmountUsdMinor,
    refundedAt: row.reservation.refundedAt
      ? row.reservation.refundedAt.toISOString()
      : null,
    priceLockedSnapshotId: row.reservation.priceLockedSnapshotId,
  };
}

/** Cron-friendly: find reservations whose expires_at has passed and mark them expired. */
export async function expireStaleReservations(now: Date = new Date()): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const updated = await db
    .update(reservations)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        isNull(reservations.cancelledAt),
        eq(reservations.status, "active"),
        lt(reservations.expiresAt, now),
      ),
    )
    .returning({ id: reservations.id });
  return updated.length;
}
