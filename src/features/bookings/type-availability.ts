import "server-only";

import { and, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";
import { bookings } from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Type-based availability for the bookings flow. For a [checkIn, checkOut)
 * window, returns each rentable villa TYPE with the villas of that type
 * that are FREE (no overlapping non-cancelled booking, no active calendar
 * block / hold). A type with `freeVillaIds.length === 0` is not bookable
 * for those dates — the form hides it.
 */
export interface AvailableVillaType {
  assetTypeId: string;
  typeName: string;
  totalVillas: number;
  freeVillaIds: string[];
}

export async function listAvailableVillaTypes(
  checkIn: string,
  checkOut: string,
): Promise<AvailableVillaType[]> {
  const db = getDb();
  if (!db) return [];

  // TENANCY: villas have no organization_id directly — scope via villa →
  // project so a caller only ever sees their own org's rentable types. Every
  // sibling in this booking flow is org-scoped; this reader was not.
  const organizationId = await requireOrgId();

  const villaRows = await db
    .select({
      id: villas.id,
      assetTypeId: villas.assetTypeId,
      typeName: assetTypes.displayName,
    })
    .from(villas)
    .innerJoin(assetTypes, eq(assetTypes.id, villas.assetTypeId))
    .innerJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(
      and(
        notInArray(villas.status, ["archived", "out_of_service"]),
        eq(assetTypes.isRentable, true),
        eq(projectsTable.organizationId, organizationId),
      ),
    );
  if (villaRows.length === 0) return [];
  const allVillaIds = villaRows.map((v) => v.id);

  const [bookingBusy, blockBusy] = await Promise.all([
    db
      .select({ villaId: bookings.villaId })
      .from(bookings)
      .where(
        and(
          inArray(bookings.villaId, allVillaIds),
          sql`${bookings.status} NOT IN ('cancelled','no_show')`,
          sql`${bookings.checkOut} > ${checkIn}`,
          sql`${bookings.checkIn} < ${checkOut}`,
        ),
      ),
    db
      .select({ villaId: villaCalendarBlocks.villaId })
      .from(villaCalendarBlocks)
      .where(
        and(
          inArray(villaCalendarBlocks.villaId, allVillaIds),
          eq(villaCalendarBlocks.status, "active"),
          lte(villaCalendarBlocks.startsAt, new Date(`${checkOut}T00:00:00.000Z`)),
          gte(villaCalendarBlocks.endsAt, new Date(`${checkIn}T00:00:00.000Z`)),
        ),
      ),
  ]);
  const busy = new Set<string>([
    ...bookingBusy.map((b) => b.villaId),
    ...blockBusy.map((b) => b.villaId),
  ]);

  const byType = new Map<string, AvailableVillaType>();
  for (const v of villaRows) {
    let t = byType.get(v.assetTypeId);
    if (!t) {
      t = { assetTypeId: v.assetTypeId, typeName: v.typeName, totalVillas: 0, freeVillaIds: [] };
      byType.set(v.assetTypeId, t);
    }
    t.totalVillas++;
    if (!busy.has(v.id)) t.freeVillaIds.push(v.id);
  }
  return Array.from(byType.values()).sort((a, b) => a.typeName.localeCompare(b.typeName));
}
