import "server-only";

import { and, eq, sql, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { projects, villas } from "@/lib/db/schema/projects";
import { owners } from "@/lib/db/schema/ownership";
import { bookings } from "@/lib/db/schema/bookings";

export interface LiveCounts {
  projects: number;
  villas: number;
  owners: number;
  activeBookings: number;
  upcomingCheckIns: number;
}

/**
 * Returns live core-entity counts when DB is configured. Returns null
 * otherwise — the dashboard uses its existing mock pulse in that case.
 */
export async function getLiveDashboardCounts(): Promise<LiveCounts | null> {
  const db = getDb();
  if (!db) return null;

  // TENANCY: scope every count to the caller's org (RLS is bypassed by the
  // DB role). projects/bookings carry organization_id; villas reach it via
  // their project; owners via owners.organization_id (mig 0173).
  const organizationId = await requireOrgId();

  const today = new Date().toISOString().slice(0, 10);
  const fourteenDays = new Date();
  fourteenDays.setDate(fourteenDays.getDate() + 14);
  const horizon = fourteenDays.toISOString().slice(0, 10);

  const [p] = await db
    .select({ c: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
  const [v] = await db
    .select({ c: sql<number>`count(*)` })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(projects.organizationId, organizationId));
  const [o] = await db
    .select({ c: sql<number>`count(*)` })
    .from(owners)
    .where(eq(owners.organizationId, organizationId));
  const [ab] = await db
    .select({ c: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "checked_in"),
        eq(bookings.organizationId, organizationId),
      ),
    );
  const [up] = await db
    .select({ c: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.checkIn, today),
        sql`${bookings.checkIn} <= ${horizon}`,
        eq(bookings.organizationId, organizationId),
      ),
    );

  return {
    projects: Number(p.c ?? 0),
    villas: Number(v.c ?? 0),
    owners: Number(o.c ?? 0),
    activeBookings: Number(ab.c ?? 0),
    upcomingCheckIns: Number(up.c ?? 0),
  };
}
