import "server-only";

import { and, eq, sql, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
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

  const today = new Date().toISOString().slice(0, 10);
  const fourteenDays = new Date();
  fourteenDays.setDate(fourteenDays.getDate() + 14);
  const horizon = fourteenDays.toISOString().slice(0, 10);

  const [p] = await db.select({ c: sql<number>`count(*)` }).from(projects);
  const [v] = await db.select({ c: sql<number>`count(*)` }).from(villas);
  const [o] = await db.select({ c: sql<number>`count(*)` }).from(owners);
  const [ab] = await db
    .select({ c: sql<number>`count(*)` })
    .from(bookings)
    .where(eq(bookings.status, "checked_in"));
  const [up] = await db
    .select({ c: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.checkIn, today),
        sql`${bookings.checkIn} <= ${horizon}`,
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
