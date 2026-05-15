import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { RoomDayStatus } from "@/components/award";

export interface RoomBoardRow {
  villaId: string;
  villaCode: string;
  projectName: string | null;
  days: Record<string, RoomDayStatus>;
}

export interface RoomBoardData {
  dates: string[];
  rows: RoomBoardRow[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadFrontOfficeRoomBoard(
  startDate: Date,
  days = 7,
): Promise<RoomBoardData> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(isoDate(d));
  }
  const db = getDb();
  if (!db) return { dates, rows: [] };

  const start = dates[0];
  const end = dates[dates.length - 1];

  // STAB-1 fix: villas table column is `unit_code` (per
  // src/lib/db/schema/projects.ts), not `villa_code`. The old name
  // crashed the entire /dashboard/front-office cabinet with
  // PostgreSQL error 42703 (column does not exist).
  const villaRows = await db.execute<{
    id: string;
    unit_code: string;
    project_name: string | null;
  }>(sql`
    SELECT v.id::text, v.unit_code, p.name AS project_name
      FROM villas v
      LEFT JOIN projects p ON p.id = v.project_id
     ORDER BY v.unit_code ASC
     LIMIT 24
  `);
  const villas =
    (villaRows as unknown as {
      rows: Array<{ id: string; unit_code: string; project_name: string | null }>;
    }).rows ?? [];

  if (villas.length === 0) return { dates, rows: [] };

  const bookingRows = await db.execute<{
    villa_id: string;
    check_in: string;
    check_out: string;
    status: string;
  }>(sql`
    SELECT villa_id::text, check_in::text, check_out::text, status
      FROM bookings
     WHERE status IN ('confirmed', 'checked_in', 'checked_out', 'tentative')
       AND check_in <= ${end}
       AND check_out >= ${start}
  `);

  const bookings =
    (bookingRows as unknown as {
      rows: Array<{
        villa_id: string;
        check_in: string;
        check_out: string;
        status: string;
      }>;
    }).rows ?? [];

  const byVilla = new Map<string, RoomBoardRow>();
  for (const v of villas) {
    const days: Record<string, RoomDayStatus> = {};
    for (const iso of dates) days[iso] = "vacant";
    byVilla.set(v.id, {
      villaId: v.id,
      villaCode: v.unit_code,
      projectName: v.project_name,
      days,
    });
  }

  for (const b of bookings) {
    const row = byVilla.get(b.villa_id);
    if (!row) continue;
    for (const iso of dates) {
      if (iso < b.check_in || iso > b.check_out) continue;
      const isArrival = iso === b.check_in;
      const isDeparture = iso === b.check_out;
      const current = row.days[iso];
      // Priority: arrival/departure > staying > blocked > vacant.
      // Blocked-style statuses (tentative) only fill if currently vacant.
      if (b.status === "tentative") {
        if (current === "vacant") row.days[iso] = "blocked";
        continue;
      }
      if (isArrival) row.days[iso] = "arrival";
      else if (isDeparture) row.days[iso] = "departure";
      else if (current === "vacant") row.days[iso] = "staying";
    }
  }

  return { dates, rows: Array.from(byVilla.values()) };
}
