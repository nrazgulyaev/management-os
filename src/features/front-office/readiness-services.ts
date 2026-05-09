import "server-only";

import { and, asc, eq, gte, inArray, lte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings, guests } from "@/lib/db/schema/bookings";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { villaReadinessStates } from "@/lib/db/schema/availability";
import { operationTasks, serviceRequests } from "@/lib/db/schema/operations";

/**
 * Stage 10.M.1 — Front-office readiness aggregation.
 *
 * Surfaces arrival-prep status across all in-flight check-ins so the
 * front desk can clear blockers before guests arrive: which villas are
 * ready, which are mid-cleaning, which have open service tickets that
 * could push the check-in time, etc.
 *
 * Read-only — every transition is owned by the existing operations
 * actions (housekeeping task complete → readiness state set ready,
 * etc.).
 */

export type VillaReadinessTone =
  | "ready"
  | "cleaning"
  | "inspection"
  | "dirty"
  | "occupied"
  | "out_of_order"
  | "maintenance_block"
  | "unknown";

export interface ReadinessRow {
  bookingId: string;
  bookingCode: string;
  villaId: string;
  villaCode: string | null;
  projectName: string | null;
  guestDisplay: string;
  guestsCount: number;
  checkInDate: string;
  bookingStatus: string;
  readinessStatus: VillaReadinessTone;
  readinessSince: string | null;
  openHousekeepingTasks: number;
  openMaintenanceTickets: number;
  openServiceRequests: number;
  isBlocked: boolean;
  blockerSummary: string | null;
}

export interface ReadinessSummary {
  arrivalsCount: number;
  villasReady: number;
  villasInProgress: number;
  villasBlocked: number;
  totalOpenBlockers: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function safeGuestDisplayName(
  fullName: string | null,
  email: string | null,
): string {
  if (fullName && fullName.trim().length > 0) {
    const [first, ...rest] = fullName.trim().split(/\s+/);
    const initial = rest.length > 0 ? rest[rest.length - 1][0] : "";
    return initial ? `${first} ${initial}.` : first;
  }
  if (email) {
    const localPart = email.split("@")[0] ?? "";
    return localPart.slice(0, 3) + "***";
  }
  return "Guest";
}

/**
 * Arrivals for `date` joined with their villa's current readiness +
 * any open housekeeping / maintenance / service-request blockers.
 */
export async function listArrivalReadiness(
  date: Date,
): Promise<ReadinessRow[]> {
  const db = getDb();
  if (!db) return [];

  const day = ymd(date);

  const arrivalRows = await db
    .select({
      b: bookings,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      guestName: guests.fullName,
      guestEmail: guests.email,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        eq(bookings.checkIn, day),
        inArray(bookings.status, ["confirmed", "tentative"]),
      ),
    )
    .orderBy(asc(bookings.checkIn));

  if (arrivalRows.length === 0) return [];

  const villaIds = Array.from(new Set(arrivalRows.map((r) => r.b.villaId)));
  const bookingIds = arrivalRows.map((r) => r.b.id);

  // Latest open readiness row per villa.
  const readinessRows = await db
    .select({
      villaId: villaReadinessStates.villaId,
      readinessStatus: villaReadinessStates.readinessStatus,
      effectiveFrom: villaReadinessStates.effectiveFrom,
    })
    .from(villaReadinessStates)
    .where(
      and(
        inArray(villaReadinessStates.villaId, villaIds),
        isNull(villaReadinessStates.effectiveTo),
      ),
    );
  const readinessByVilla: Record<
    string,
    { status: VillaReadinessTone; since: Date }
  > = {};
  for (const r of readinessRows) {
    const status = r.readinessStatus as VillaReadinessTone;
    if (!readinessByVilla[r.villaId]) {
      readinessByVilla[r.villaId] = { status, since: r.effectiveFrom };
    }
  }

  // Open housekeeping tasks per villa scheduled for arrival day.
  const housekeepingRows = await db
    .select({
      villaId: operationTasks.villaId,
      count: sql<number>`count(*)::int`,
    })
    .from(operationTasks)
    .where(
      and(
        inArray(operationTasks.villaId, villaIds),
        eq(operationTasks.category, "housekeeping"),
        gte(operationTasks.scheduledFor, day),
        lte(operationTasks.scheduledFor, day),
        inArray(operationTasks.status, [
          "open",
          "scheduled",
          "in_progress",
        ]),
      ),
    )
    .groupBy(operationTasks.villaId);
  const housekeepingByVilla: Record<string, number> = {};
  for (const r of housekeepingRows) {
    if (r.villaId) housekeepingByVilla[r.villaId] = Number(r.count) || 0;
  }

  // Open maintenance tasks per villa (no scheduled-for filter — any open).
  const maintenanceRows = await db
    .select({
      villaId: operationTasks.villaId,
      count: sql<number>`count(*)::int`,
    })
    .from(operationTasks)
    .where(
      and(
        inArray(operationTasks.villaId, villaIds),
        eq(operationTasks.category, "maintenance"),
        inArray(operationTasks.status, [
          "open",
          "scheduled",
          "in_progress",
        ]),
      ),
    )
    .groupBy(operationTasks.villaId);
  const maintenanceByVilla: Record<string, number> = {};
  for (const r of maintenanceRows) {
    if (r.villaId) maintenanceByVilla[r.villaId] = Number(r.count) || 0;
  }

  // Open service requests per booking.
  const srRows = await db
    .select({ bookingId: serviceRequests.bookingId })
    .from(serviceRequests)
    .where(
      and(
        inArray(serviceRequests.bookingId, bookingIds),
        inArray(serviceRequests.status, ["new", "open", "in_progress"]),
      ),
    );
  const srByBooking: Record<string, number> = {};
  for (const r of srRows) {
    if (r.bookingId) {
      srByBooking[r.bookingId] = (srByBooking[r.bookingId] ?? 0) + 1;
    }
  }

  return arrivalRows.map((r) => {
    const readiness = readinessByVilla[r.b.villaId];
    const status: VillaReadinessTone = readiness?.status ?? "unknown";
    const housekeepingOpen = housekeepingByVilla[r.b.villaId] ?? 0;
    const maintenanceOpen = maintenanceByVilla[r.b.villaId] ?? 0;
    const serviceOpen = srByBooking[r.b.id] ?? 0;
    const isBlocked =
      status === "out_of_order" ||
      status === "maintenance_block" ||
      maintenanceOpen > 0;
    const blockerParts: string[] = [];
    if (status === "out_of_order") blockerParts.push("villa OOO");
    if (status === "maintenance_block")
      blockerParts.push("maintenance block on villa");
    if (housekeepingOpen > 0)
      blockerParts.push(
        `${housekeepingOpen} housekeeping task${housekeepingOpen === 1 ? "" : "s"} pending`,
      );
    if (maintenanceOpen > 0)
      blockerParts.push(
        `${maintenanceOpen} maintenance ticket${maintenanceOpen === 1 ? "" : "s"} open`,
      );
    if (serviceOpen > 0)
      blockerParts.push(
        `${serviceOpen} service request${serviceOpen === 1 ? "" : "s"} open`,
      );

    return {
      bookingId: r.b.id,
      bookingCode: r.b.bookingCode,
      villaId: r.b.villaId,
      villaCode: r.villaCode ?? null,
      projectName: r.projectName ?? null,
      guestDisplay: safeGuestDisplayName(r.guestName, r.guestEmail),
      guestsCount: (r.b.adults ?? 0) + (r.b.children ?? 0),
      checkInDate: r.b.checkIn as unknown as string,
      bookingStatus: r.b.status,
      readinessStatus: status,
      readinessSince: readiness?.since
        ? readiness.since.toISOString()
        : null,
      openHousekeepingTasks: housekeepingOpen,
      openMaintenanceTickets: maintenanceOpen,
      openServiceRequests: serviceOpen,
      isBlocked,
      blockerSummary:
        blockerParts.length > 0 ? blockerParts.join(" · ") : null,
    };
  });
}

export function summarizeReadiness(rows: ReadinessRow[]): ReadinessSummary {
  let villasReady = 0;
  let villasInProgress = 0;
  let villasBlocked = 0;
  let totalOpenBlockers = 0;

  for (const r of rows) {
    if (r.isBlocked) villasBlocked += 1;
    else if (r.readinessStatus === "ready") villasReady += 1;
    else villasInProgress += 1;
    totalOpenBlockers +=
      r.openHousekeepingTasks +
      r.openMaintenanceTickets +
      r.openServiceRequests;
  }

  return {
    arrivalsCount: rows.length,
    villasReady,
    villasInProgress,
    villasBlocked,
    totalOpenBlockers,
  };
}
