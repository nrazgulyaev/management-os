import "server-only";

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  ownerVisibleEvents,
  guestReviews,
} from "@/lib/db/schema/owner-intelligence";
import { ownershipShares } from "@/lib/db/schema/ownership";
import {
  bookings,
  bookingChannels,
  guests,
} from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import {
  operationTasks,
  maintenanceTickets,
} from "@/lib/db/schema/operations";
import { ownerStatements } from "@/lib/db/schema/finance";
import { guestJourneyEvents } from "@/lib/db/schema/guest-journey";
import { villas } from "@/lib/db/schema/projects";
import { maskGuestName } from "@/features/owner-intelligence/calendar-pure";
import {
  buildOwnerVisibleEventFromJourneyEvent,
  type JourneyEventShape,
  type JourneyEventSeverity,
} from "./events-pure";

/**
 * Rebuild the `owner_visible_events` projection for a given owner /
 * villa / time window. This replaces the Prompt 101 stub with a real
 * deterministic projection across the canonical sources.
 *
 * Sources merged (each owner-safe by design):
 *   - bookings (masked guest label, channel name, headline count)
 *   - villa_calendar_blocks (maintenance / hold / out_of_order)
 *   - owner_stay_requests (only the owner's own rows)
 *   - operation_tasks where owner_visible=true (housekeeping headline)
 *   - maintenance_tickets owner-safe summary (no internal notes)
 *   - guest_reviews owner_visible=true and status=published
 *   - owner_statements issued/approved/paid
 *   - guest_journey_events owner_visible=true (sanitized)
 *
 * Privacy contract enforced here:
 *   - guest emails / phones never leave the seam — only the masked
 *     label `maskGuestName(guest.full_name)` does
 *   - lock codes / Wi-Fi passwords / token hashes / camera URLs are
 *     never read from this module
 *   - maintenance descriptions are replaced with a generic label
 *     unless the source already flagged them as owner-safe
 */

interface OwnerScope {
  ownerId: string;
  villaIds: string[];
  projectIds: string[];
}

async function loadOwnerScope(ownerId: string): Promise<OwnerScope> {
  const db = getDb();
  if (!db) return { ownerId, villaIds: [], projectIds: [] };
  const rows = await db
    .select({
      villaId: ownershipShares.villaId,
      projectId: ownershipShares.projectId,
    })
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.ownerId, ownerId),
        eq(ownershipShares.status, "active"),
      ),
    );
  // Owners that participate in a pool (project-level share) see the
  // whole pool's villas; we resolve this on read by accepting both
  // villa- and project-scoped rows.
  const villaIds = Array.from(
    new Set(rows.map((r) => r.villaId).filter((x): x is string => !!x)),
  );
  const projectIds = Array.from(
    new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x)),
  );
  if (projectIds.length > 0) {
    const villaRows = await db
      .select({ id: villas.id })
      .from(villas)
      .where(inArray(villas.projectId, projectIds));
    for (const v of villaRows) {
      if (!villaIds.includes(v.id)) villaIds.push(v.id);
    }
  }
  return { ownerId, villaIds, projectIds };
}

interface DraftRow {
  villaId: string | null;
  projectId: string | null;
  sourceType: string;
  sourceId: string | null;
  eventDate: string;
  eventEndDate: string | null;
  title: string;
  description: string | null;
  severity: JourneyEventSeverity;
  sortOrder: number;
}

function isoDate(d: Date | string | null): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function withinRange(
  date: string | null,
  from: string,
  to: string,
): boolean {
  if (!date) return false;
  return date >= from && date <= to;
}

async function collectBookingDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db || scope.villaIds.length === 0) return [];
  const rows = await db
    .select({
      id: bookings.id,
      villaId: bookings.villaId,
      projectId: villas.projectId,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      status: bookings.status,
      adults: bookings.adults,
      children: bookings.children,
      channelName: bookingChannels.name,
      guestFullName: guests.fullName,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        inArray(bookings.villaId, scope.villaIds),
        sql`${bookings.checkOut} >= ${from}`,
        sql`${bookings.checkIn} <= ${to}`,
      ),
    );
  return rows.map((b) => {
    const headcount =
      (b.adults ?? 0) + (b.children ?? 0) || null;
    const label = maskGuestName(b.guestFullName);
    const channel = b.channelName ?? "Direct";
    const desc = `${channel}${
      headcount ? ` · ${headcount} guest${headcount === 1 ? "" : "s"}` : ""
    } · ${b.status}`;
    return {
      villaId: b.villaId,
      projectId: b.projectId ?? null,
      sourceType: "booking",
      sourceId: b.id,
      eventDate: b.checkIn,
      eventEndDate: b.checkOut,
      title: label,
      description: desc,
      severity: "info",
      sortOrder: 10,
    };
  });
}

async function collectBlockDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db || scope.villaIds.length === 0) return [];
  const fromTs = new Date(`${from}T00:00:00.000Z`);
  const toTs = new Date(`${to}T23:59:59.999Z`);
  const rows = await db
    .select()
    .from(villaCalendarBlocks)
    .where(
      and(
        inArray(villaCalendarBlocks.villaId, scope.villaIds),
        lte(villaCalendarBlocks.startsAt, toTs),
        gte(villaCalendarBlocks.endsAt, fromTs),
        eq(villaCalendarBlocks.status, "active"),
      ),
    );
  return rows.map((b) => ({
    villaId: b.villaId,
    projectId: b.projectId ?? null,
    sourceType: "maintenance_block",
    sourceId: b.id,
    eventDate: isoDate(b.startsAt) ?? from,
    eventEndDate: isoDate(b.endsAt),
    title: b.ownerVisible ? b.title : "Maintenance",
    description: b.ownerVisible ? b.description : null,
    severity: b.blockType === "out_of_order" ? "warning" : "info",
    sortOrder: 30,
  }));
}

async function collectOwnerStayDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.ownerId, scope.ownerId),
        sql`${ownerStayRequests.requestedEnd} >= ${from}`,
        sql`${ownerStayRequests.requestedStart} <= ${to}`,
      ),
    );
  return rows.map((s) => ({
    villaId: s.villaId,
    projectId: s.projectId ?? null,
    sourceType: "owner_stay",
    sourceId: s.id,
    eventDate: s.requestedStart,
    eventEndDate: s.requestedEnd,
    title: "Owner stay",
    description: `Status: ${s.status}`,
    severity: "info",
    sortOrder: 20,
  }));
}

async function collectOperationsTaskDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db || scope.villaIds.length === 0) return [];
  const rows = await db
    .select()
    .from(operationTasks)
    .where(
      and(
        inArray(operationTasks.villaId, scope.villaIds),
        sql`${operationTasks.scheduledFor} >= ${from}`,
        sql`${operationTasks.scheduledFor} <= ${to}`,
      ),
    );
  return rows
    .filter(
      (t) =>
        t.ownerVisible &&
        t.scheduledFor &&
        ["housekeeping", "inspection", "preventive_maintenance"].includes(
          t.category,
        ),
    )
    .map((t) => ({
      villaId: t.villaId,
      projectId: t.projectId ?? null,
      sourceType: "housekeeping_task",
      sourceId: t.id,
      eventDate: t.scheduledFor!,
      eventEndDate: null,
      title:
        t.category === "housekeeping"
          ? "Housekeeping"
          : t.category === "inspection"
            ? "Inspection"
            : "Preventive maintenance",
      description: null,
      severity: "info" as JourneyEventSeverity,
      sortOrder: 40,
    }));
}

async function collectMaintenanceTicketDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db || scope.villaIds.length === 0) return [];
  const fromTs = new Date(`${from}T00:00:00.000Z`);
  const toTs = new Date(`${to}T23:59:59.999Z`);
  const rows = await db
    .select()
    .from(maintenanceTickets)
    .where(
      and(
        inArray(maintenanceTickets.villaId, scope.villaIds),
        gte(maintenanceTickets.createdAt, fromTs),
        lte(maintenanceTickets.createdAt, toTs),
      ),
    );
  return rows.map((t) => ({
    villaId: t.villaId,
    projectId: null,
    sourceType: "maintenance_ticket",
    sourceId: t.id,
    eventDate: isoDate(t.createdAt) ?? from,
    eventEndDate: null,
    title: "Maintenance ticket",
    description: `Severity: ${t.severity ?? "p2"} · status ${t.status}`,
    severity: t.severity === "p0" || t.severity === "p1" ? "warning" : "info",
    sortOrder: 50,
  }));
}

async function collectReviewDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(guestReviews)
    .where(
      and(
        eq(guestReviews.ownerVisible, true),
        eq(guestReviews.status, "published"),
        sql`${guestReviews.reviewDate} >= ${from}`,
        sql`${guestReviews.reviewDate} <= ${to}`,
      ),
    );
  return rows
    .filter((r) =>
      r.villaId
        ? scope.villaIds.includes(r.villaId)
        : r.projectId
          ? scope.projectIds.includes(r.projectId)
          : false,
    )
    .map((r) => ({
      villaId: r.villaId,
      projectId: r.projectId,
      sourceType: "review",
      sourceId: r.id,
      eventDate: r.reviewDate ?? from,
      eventEndDate: null,
      title: `Review · ${r.rating ?? "?"}/5`,
      description: r.text ? r.text.slice(0, 240) : null,
      severity:
        r.sentiment === "negative"
          ? "warning"
          : r.sentiment === "positive"
            ? "success"
            : "info",
      sortOrder: 60,
    }));
}

async function collectStatementDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db) return [];
  const fromTs = new Date(`${from}T00:00:00.000Z`);
  const toTs = new Date(`${to}T23:59:59.999Z`);
  const rows = await db
    .select()
    .from(ownerStatements)
    .where(
      and(
        eq(ownerStatements.ownerId, scope.ownerId),
        gte(ownerStatements.updatedAt, fromTs),
        lte(ownerStatements.updatedAt, toTs),
      ),
    );
  return rows
    .filter((s) =>
      ["issued", "approved", "paid"].includes(s.status),
    )
    .map((s) => ({
      villaId: s.villaId,
      projectId: s.projectId ?? null,
      sourceType: "statement",
      sourceId: s.id,
      eventDate: isoDate(s.issuedAt) ?? isoDate(s.updatedAt) ?? from,
      eventEndDate: null,
      title: `Statement ${s.statementCode}`,
      description: `Status: ${s.status}`,
      severity:
        s.status === "paid"
          ? "success"
          : s.status === "approved"
            ? "info"
            : "info",
      sortOrder: 70,
    }));
}

async function collectJourneyEventDrafts(
  scope: OwnerScope,
  from: string,
  to: string,
): Promise<DraftRow[]> {
  const db = getDb();
  if (!db) return [];
  const fromTs = new Date(`${from}T00:00:00.000Z`);
  const toTs = new Date(`${to}T23:59:59.999Z`);
  const rows = await db
    .select({
      event: guestJourneyEvents,
      bookingVillaId: bookings.villaId,
      villaProjectId: villas.projectId,
      guestFullName: guests.fullName,
    })
    .from(guestJourneyEvents)
    .leftJoin(bookings, eq(bookings.id, guestJourneyEvents.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        eq(guestJourneyEvents.ownerVisible, true),
        gte(guestJourneyEvents.eventAt, fromTs),
        lte(guestJourneyEvents.eventAt, toTs),
      ),
    )
    .orderBy(desc(guestJourneyEvents.eventAt));

  const drafts: DraftRow[] = [];
  for (const row of rows) {
    if (!row.bookingVillaId) continue;
    if (!scope.villaIds.includes(row.bookingVillaId)) continue;
    const shape: JourneyEventShape & { guestFullName?: string | null } = {
      bookingId: row.event.bookingId,
      stayTokenId: row.event.stayTokenId,
      eventType: row.event.eventType as JourneyEventShape["eventType"],
      sourceType: row.event.sourceType as JourneyEventShape["sourceType"],
      sourceId: row.event.sourceId,
      title: row.event.title,
      description: row.event.description,
      eventAt: row.event.eventAt,
      ownerVisible: row.event.ownerVisible,
      severity: row.event.severity as JourneyEventSeverity,
      metadataJson:
        (row.event.metadataJson as Record<string, unknown> | null) ?? null,
      guestFullName: row.guestFullName ?? null,
    };
    const draft = buildOwnerVisibleEventFromJourneyEvent({
      event: shape,
      ownerId: scope.ownerId,
      villaId: row.bookingVillaId,
      projectId: row.villaProjectId ?? null,
      sortOrder: 80,
    });
    if (draft) {
      drafts.push({
        villaId: draft.villaId,
        projectId: draft.projectId,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        eventDate: draft.eventDate,
        eventEndDate: draft.eventEndDate,
        title: draft.title,
        description: draft.description,
        severity: draft.severity,
        sortOrder: draft.sortOrder,
      });
    }
  }
  return drafts;
}

export async function rebuildOwnerVisibleEventsForOwner(
  ownerId: string,
  from: string,
  to: string,
): Promise<{ inserted: number }> {
  const db = getDb();
  if (!db) return { inserted: 0 };
  const scope = await loadOwnerScope(ownerId);
  if (scope.villaIds.length === 0 && scope.projectIds.length === 0) {
    return { inserted: 0 };
  }
  const drafts = (
    await Promise.all([
      collectBookingDrafts(scope, from, to),
      collectBlockDrafts(scope, from, to),
      collectOwnerStayDrafts(scope, from, to),
      collectOperationsTaskDrafts(scope, from, to),
      collectMaintenanceTicketDrafts(scope, from, to),
      collectReviewDrafts(scope, from, to),
      collectStatementDrafts(scope, from, to),
      collectJourneyEventDrafts(scope, from, to),
    ])
  ).flat();

  // Clear existing owner_visible_events for this owner in the window.
  await db
    .delete(ownerVisibleEvents)
    .where(
      and(
        eq(ownerVisibleEvents.ownerId, ownerId),
        sql`${ownerVisibleEvents.eventDate} >= ${from}`,
        sql`${ownerVisibleEvents.eventDate} <= ${to}`,
      ),
    );

  if (drafts.length === 0) return { inserted: 0 };

  // Filter to drafts whose event_date falls inside the window.
  const filtered = drafts.filter((d) => withinRange(d.eventDate, from, to));
  if (filtered.length === 0) return { inserted: 0 };
  await db.insert(ownerVisibleEvents).values(
    filtered.map((d) => ({
      ownerId,
      villaId: d.villaId,
      projectId: d.projectId,
      sourceType: d.sourceType,
      sourceId: d.sourceId,
      eventDate: d.eventDate,
      eventEndDate: d.eventEndDate,
      title: d.title ?? "Event",
      description: d.description ?? null,
      severity: d.severity,
      ownerVisible: true,
      sortOrder: d.sortOrder ?? 100,
    })),
  );
  return { inserted: filtered.length };
}

export async function rebuildOwnerVisibleEventsForVilla(
  villaId: string,
  from: string,
  to: string,
): Promise<{ insertedByOwner: number; ownersTouched: number }> {
  const db = getDb();
  if (!db) return { insertedByOwner: 0, ownersTouched: 0 };
  const owners = await db
    .selectDistinct({ ownerId: ownershipShares.ownerId })
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.status, "active"),
        eq(ownershipShares.villaId, villaId),
      ),
    );
  let inserted = 0;
  for (const o of owners) {
    const out = await rebuildOwnerVisibleEventsForOwner(o.ownerId, from, to);
    inserted += out.inserted;
  }
  return { insertedByOwner: inserted, ownersTouched: owners.length };
}

export async function rebuildOwnerVisibleEventsForAllOwners(
  from: string,
  to: string,
): Promise<{ ownersProcessed: number; inserted: number }> {
  const db = getDb();
  if (!db) return { ownersProcessed: 0, inserted: 0 };
  const owners = await db
    .selectDistinct({ ownerId: ownershipShares.ownerId })
    .from(ownershipShares)
    .where(eq(ownershipShares.status, "active"));
  let inserted = 0;
  for (const o of owners) {
    const out = await rebuildOwnerVisibleEventsForOwner(o.ownerId, from, to);
    inserted += out.inserted;
  }
  return { ownersProcessed: owners.length, inserted };
}
