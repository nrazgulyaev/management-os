import "server-only";

import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings, bookingChannels, guests } from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { operationTasks } from "@/lib/db/schema/operations";
import { ownershipShares } from "@/lib/db/schema/ownership";
import { villas, projects } from "@/lib/db/schema/projects";
import {
  ownerCalendarPreferences,
  type OwnerCalendarPreference,
} from "@/lib/db/schema/owner-intelligence";
import { listOwnerIdsForCurrentUser } from "@/features/notifications/services";
import { listOwners } from "@/features/owners/services";
import {
  mergeCalendarSources,
  ownerSafeBookingProjection,
  type OwnerCalendarEvent,
  type OwnerCalendarPreferenceShape,
  type RawBlockForOwner,
  type RawBookingForOwner,
  type RawOpsTaskForOwner,
  type RawOwnerStayForOwner,
} from "./calendar-pure";

/**
 * Calendar services — owner-safe projections off the canonical
 * sources. Every public function strictly returns owner-safe shapes
 * (no email / phone / token hash / lock code / supplier cost).
 */

const DEFAULT_PREFERENCES: OwnerCalendarPreferenceShape = {
  showGuestNames: true,
  showGuestCountry: true,
  showChannelLabels: true,
  showMaintenanceDetails: true,
};

export interface OwnerVillaSummary {
  villaId: string;
  villaCode: string | null;
  villaName: string | null;
  projectId: string | null;
  projectName: string | null;
  ownerId: string;
}

/**
 * List the villas (and their owner share) the current owner has
 * access to. When the caller is an internal admin we return every
 * villa they could see (helper still honours `isInternal` callers
 * upstream).
 */
export async function listOwnerVillasForCurrentUser(opts?: {
  ownerId?: string;
}): Promise<OwnerVillaSummary[]> {
  const ownerIds = opts?.ownerId
    ? [opts.ownerId]
    : await listOwnerIdsForCurrentUser();
  return villasForOwnerIds(ownerIds);
}

/**
 * Admin (owner-intelligence) variant: list every villa the operator's org
 * owns. Resolves owner ids via the org-scoped `listOwners()` reader instead of
 * the `appUsersOwners` grant pivot (which is empty for operators), so the admin
 * calendar isn't a dead-end. Owner ids are already org-bounded, so the share
 * query below stays org-scoped.
 */
export async function listOwnerVillasForOrg(): Promise<OwnerVillaSummary[]> {
  const owners = await listOwners();
  return villasForOwnerIds(owners.map((o) => o.id));
}

async function villasForOwnerIds(
  ownerIds: ReadonlyArray<string>,
): Promise<OwnerVillaSummary[]> {
  const db = getDb();
  if (!db) return [];
  if (ownerIds.length === 0) return [];
  const rows = await db
    .select({
      shareOwnerId: ownershipShares.ownerId,
      villaId: ownershipShares.villaId,
      projectId: ownershipShares.projectId,
      villaCode: villas.unitCode,
      villaName: villas.name,
      projectName: projects.name,
    })
    .from(ownershipShares)
    .leftJoin(villas, eq(villas.id, ownershipShares.villaId))
    .leftJoin(projects, eq(projects.id, ownershipShares.projectId))
    .where(
      and(
        inArray(ownershipShares.ownerId, ownerIds as string[]),
        eq(ownershipShares.status, "active"),
      ),
    );
  // Deduplicate on villa id (the same villa could appear under multiple
  // share rows; the owner only wants one calendar row).
  const seen = new Set<string>();
  const out: OwnerVillaSummary[] = [];
  for (const r of rows) {
    if (!r.villaId) continue;
    if (seen.has(r.villaId)) continue;
    seen.add(r.villaId);
    out.push({
      villaId: r.villaId,
      villaCode: r.villaCode ?? null,
      villaName: r.villaName ?? null,
      projectId: r.projectId ?? null,
      projectName: r.projectName ?? null,
      ownerId: r.shareOwnerId,
    });
  }
  out.sort((a, b) =>
    (a.villaCode ?? a.villaId).localeCompare(b.villaCode ?? b.villaId),
  );
  return out;
}

export async function getOwnerCalendarPreferences(
  ownerId: string,
): Promise<OwnerCalendarPreference | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(ownerCalendarPreferences)
    .where(eq(ownerCalendarPreferences.ownerId, ownerId))
    .limit(1);
  return row ?? null;
}

export function preferenceShape(
  pref: OwnerCalendarPreference | null,
): OwnerCalendarPreferenceShape {
  if (!pref) return { ...DEFAULT_PREFERENCES };
  return {
    showGuestNames: pref.showGuestNames,
    showGuestCountry: pref.showGuestCountry,
    showChannelLabels: pref.showChannelLabels,
    showMaintenanceDetails: pref.showMaintenanceDetails,
  };
}

// -----------------------------------------------------------------------------
// Per-source readers — they all live here so the projection rules
// stay co-located with the calendar service.
// -----------------------------------------------------------------------------

async function readBookings(
  villaIds: ReadonlyArray<string>,
  from: string,
  to: string,
): Promise<RawBookingForOwner[]> {
  if (villaIds.length === 0) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: bookings.id,
      villaId: bookings.villaId,
      villaCode: villas.unitCode,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      status: bookings.status,
      adults: bookings.adults,
      children: bookings.children,
      channelLabel: bookingChannels.name,
      guestFullName: guests.fullName,
      guestCountry: guests.nationality,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(
      bookingChannels,
      eq(bookingChannels.id, bookings.channelId),
    )
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        inArray(bookings.villaId, villaIds as string[]),
        lte(bookings.checkIn, to),
        gte(bookings.checkOut, from),
      ),
    )
    .orderBy(asc(bookings.checkIn));
  return rows.map((r) =>
    ownerSafeBookingProjection({
      id: r.id,
      villaId: r.villaId,
      villaCode: r.villaCode ?? null,
      checkIn: r.checkIn as unknown as string,
      checkOut: r.checkOut as unknown as string,
      status: r.status,
      channelLabel: r.channelLabel ?? null,
      guestFullName: r.guestFullName ?? null,
      guestCountry: r.guestCountry ?? null,
      guestCount:
        (r.adults ?? 0) + (r.children ?? 0) || null,
    }),
  );
}

async function readBlocks(
  villaIds: ReadonlyArray<string>,
  from: string,
  to: string,
): Promise<RawBlockForOwner[]> {
  if (villaIds.length === 0) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: villaCalendarBlocks.id,
      villaId: villaCalendarBlocks.villaId,
      villaCode: villas.unitCode,
      blockType: villaCalendarBlocks.blockType,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
      title: villaCalendarBlocks.title,
      description: villaCalendarBlocks.description,
      ownerVisible: villaCalendarBlocks.ownerVisible,
    })
    .from(villaCalendarBlocks)
    .leftJoin(villas, eq(villas.id, villaCalendarBlocks.villaId))
    .where(
      and(
        inArray(villaCalendarBlocks.villaId, villaIds as string[]),
        eq(villaCalendarBlocks.status, "active"),
        lt(villaCalendarBlocks.startsAt, new Date(`${to}T23:59:59Z`)),
        sql`${villaCalendarBlocks.endsAt} > ${from}::timestamptz`,
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    villaId: r.villaId,
    villaCode: r.villaCode ?? null,
    source: classifyBlockSource(r.blockType),
    startDate: toISODate(r.startsAt),
    endDate: toISODate(r.endsAt),
    reason: r.ownerVisible
      ? r.title ?? r.description ?? labelForBlockType(r.blockType)
      : labelForBlockType(r.blockType),
  }));
}

function classifyBlockSource(
  blockType: string,
): RawBlockForOwner["source"] {
  if (blockType === "out_of_order") return "out_of_order";
  if (blockType === "internal_hold" || blockType === "manual")
    return "internal_hold";
  return "maintenance_block";
}

function labelForBlockType(blockType: string): string {
  if (blockType === "out_of_order") return "Out of order";
  if (blockType === "internal_hold" || blockType === "manual")
    return "Internal hold";
  return "Maintenance";
}

async function readOwnerStays(
  villaIds: ReadonlyArray<string>,
  from: string,
  to: string,
): Promise<RawOwnerStayForOwner[]> {
  if (villaIds.length === 0) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: ownerStayRequests.id,
      villaId: ownerStayRequests.villaId,
      villaCode: villas.unitCode,
      checkIn: ownerStayRequests.requestedStart,
      checkOut: ownerStayRequests.requestedEnd,
      status: ownerStayRequests.status,
    })
    .from(ownerStayRequests)
    .leftJoin(villas, eq(villas.id, ownerStayRequests.villaId))
    .where(
      and(
        inArray(ownerStayRequests.villaId, villaIds as string[]),
        sql`${ownerStayRequests.status} not in ('cancelled','rejected')`,
        lte(ownerStayRequests.requestedStart, to),
        gte(ownerStayRequests.requestedEnd, from),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    villaId: r.villaId ?? "",
    villaCode: r.villaCode ?? null,
    startDate: r.checkIn as unknown as string,
    endDate: r.checkOut as unknown as string,
    status: r.status,
  }));
}

async function readOpsTasks(
  villaIds: ReadonlyArray<string>,
  from: string,
  to: string,
): Promise<RawOpsTaskForOwner[]> {
  if (villaIds.length === 0) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: operationTasks.id,
      villaId: operationTasks.villaId,
      villaCode: villas.unitCode,
      category: operationTasks.category,
      title: operationTasks.title,
      scheduledFor: operationTasks.scheduledFor,
      status: operationTasks.status,
    })
    .from(operationTasks)
    .leftJoin(villas, eq(villas.id, operationTasks.villaId))
    .where(
      and(
        inArray(operationTasks.villaId, villaIds as string[]),
        sql`${operationTasks.scheduledFor} is not null`,
        gte(operationTasks.scheduledFor, from),
        lte(operationTasks.scheduledFor, to),
      ),
    )
    .orderBy(asc(operationTasks.scheduledFor));
  return rows
    .filter((r) => r.scheduledFor !== null)
    .map((r) => {
      const cat = (r.category ?? "").toLowerCase();
      const source: RawOpsTaskForOwner["source"] = cat.includes(
        "housekeep",
      )
        ? "housekeeping_task"
        : cat.includes("inspect") || cat.includes("readiness")
          ? "readiness"
          : "maintenance_ticket";
      return {
        id: r.id,
        villaId: r.villaId ?? "",
        villaCode: r.villaCode ?? null,
        source,
        scheduledFor: toISODate(r.scheduledFor!),
        title: r.title ?? labelForTaskSource(source),
      };
    });
}

function labelForTaskSource(source: RawOpsTaskForOwner["source"]): string {
  if (source === "housekeeping_task") return "Housekeeping";
  if (source === "readiness") return "Inspection";
  return "Maintenance ticket";
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface OwnerCalendarRow {
  villa: OwnerVillaSummary;
  events: OwnerCalendarEvent[];
}

export async function listOwnerCalendarRows(args: {
  from: string;
  to: string;
  ownerId?: string;
}): Promise<OwnerCalendarRow[]> {
  const villas = await listOwnerVillasForCurrentUser({
    ownerId: args.ownerId,
  });
  return buildCalendarRows(villas, args.from, args.to);
}

/**
 * Admin (owner-intelligence) calendar projection across every villa the
 * operator's org owns. Resolves villas via the org-scoped `listOwnerVillasForOrg`
 * instead of the grant pivot, so the admin calendar isn't a dead-end.
 */
export async function listOwnerCalendarRowsForOrg(args: {
  from: string;
  to: string;
}): Promise<OwnerCalendarRow[]> {
  const villas = await listOwnerVillasForOrg();
  return buildCalendarRows(villas, args.from, args.to);
}

async function buildCalendarRows(
  villas: ReadonlyArray<OwnerVillaSummary>,
  from: string,
  to: string,
): Promise<OwnerCalendarRow[]> {
  if (villas.length === 0) return [];
  const villaIds = villas.map((v) => v.villaId);
  const ownerIds = Array.from(new Set(villas.map((v) => v.ownerId)));
  // Pull preferences from any matching owner row; if none configured,
  // we use defaults.
  let preferences: OwnerCalendarPreferenceShape = { ...DEFAULT_PREFERENCES };
  for (const id of ownerIds) {
    const pref = await getOwnerCalendarPreferences(id);
    if (pref) {
      preferences = preferenceShape(pref);
      break;
    }
  }
  const [bookingsRows, blocks, ownerStays, tasks] = await Promise.all([
    readBookings(villaIds, from, to),
    readBlocks(villaIds, from, to),
    readOwnerStays(villaIds, from, to),
    readOpsTasks(villaIds, from, to),
  ]);
  const merged = mergeCalendarSources({
    bookings: bookingsRows,
    blocks,
    ownerStays,
    tasks,
    preferences,
  });
  return villas.map((v) => ({
    villa: v,
    events: merged.filter((e) => e.villaId === v.villaId),
  }));
}

export async function getOwnerVillaCalendar(
  villaId: string,
  from: string,
  to: string,
): Promise<OwnerCalendarEvent[]> {
  const own = await listOwnerVillasForCurrentUser();
  const v = own.find((o) => o.villaId === villaId);
  if (!v) return [];
  const ownerPref = await getOwnerCalendarPreferences(v.ownerId);
  const preferences = preferenceShape(ownerPref);
  const [bookingsRows, blocks, ownerStays, tasks] = await Promise.all([
    readBookings([villaId], from, to),
    readBlocks([villaId], from, to),
    readOwnerStays([villaId], from, to),
    readOpsTasks([villaId], from, to),
  ]);
  return mergeCalendarSources({
    bookings: bookingsRows,
    blocks,
    ownerStays,
    tasks,
    preferences,
  });
}

export interface OwnerSafeReviewSummary {
  id: string;
  villaId: string | null;
  rating: number | null;
  reviewerDisplayName: string | null;
  reviewerCountry: string | null;
  text: string | null;
  reviewDate: string | null;
  source: string;
  sentiment: string | null;
}

/**
 * Internal-only helper used by tests + admin tooling. The owner
 * route reads through `reviews-services.ts` which adds the RLS
 * scope.
 */
export async function listOwnerCalendarEvents(args: {
  from: string;
  to: string;
  ownerId?: string;
  villaId?: string;
}): Promise<OwnerCalendarEvent[]> {
  if (args.villaId) {
    return getOwnerVillaCalendar(args.villaId, args.from, args.to);
  }
  const rows = await listOwnerCalendarRows({
    from: args.from,
    to: args.to,
    ownerId: args.ownerId,
  });
  return rows.flatMap((r) => r.events);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function toISODate(d: Date | string): string {
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const parsed = new Date(d);
    return formatISODate(parsed);
  }
  return formatISODate(d);
}

function formatISODate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Helper to keep imports honest.
export { listOwnerIdsForCurrentUser };

// Suppress unused-import lint warnings for the desc helper used
// elsewhere (kept available for future paging).
export const _drizzle = { desc };
