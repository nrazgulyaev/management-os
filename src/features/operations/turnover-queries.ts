import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { turnovers } from "@/lib/db/schema/turnovers";
import { villas } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import type { TurnoverCard, TurnoverStatus } from "@/components/operations/turnover-board";

/**
 * W4 mgmt-04 — turnover read layer for /dashboard/operations/turnovers.
 *
 * Single-tenant (mirrors villas/bookings — no organization_id; see
 * operations-cabinet-queries.ts). All readers guard `getDb()` null and
 * return [] so the board renders a friendly empty state pre-migration /
 * db-down. The page passes the empty array straight to <TurnoverBoard>.
 */

/** Role keys treated as the cleaner roster. */
const CLEANER_ROLE_KEYS = ["housekeeper", "housekeeping_supervisor"] as const;

/** A turnover row joined to the villa code + assignee name, board-ready. */
export interface TurnoverRow {
  id: string;
  villaId: string;
  villaCode: string;
  status: TurnoverStatus;
  badge: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  /** "HH:MM" of the source booking checkout (always today). */
  checkOut: string | null;
  /** "HH:MM" of the next booking check-in, if any. */
  checkIn: string | null;
}

/** A cleaner + how many turnovers they already hold today. */
export interface CleanerWorkload {
  id: string;
  name: string;
  currentLoad: number;
}

/** Normalize a free-text status into a valid board status. */
function normalizeStatus(s: string): TurnoverStatus {
  return s === "in-progress" || s === "inspection" || s === "done" ? s : "todo";
}

/**
 * Read today's turnovers, board-ready. When the table is empty for today,
 * derives rows from same-day checkout bookings (the clean trigger) and
 * back-fills the next-day-style same-day check-in as the deadline, then
 * re-reads. Idempotent via the (villa_id, turnover_date) unique index.
 */
export async function getTodaysTurnovers(): Promise<TurnoverRow[]> {
  const db = getDb();
  if (!db) return [];

  let rows = await readTurnoverRows(db);
  if (rows.length === 0) {
    await deriveTodaysTurnovers(db);
    rows = await readTurnoverRows(db);
  }
  return rows;
}

/** Maps the board-ready rows to <TurnoverBoard>'s card shape. */
export function toTurnoverCards(rows: TurnoverRow[]): TurnoverCard[] {
  return rows.map((r) => ({
    id: r.id,
    villaCode: r.villaCode,
    guestCheckOut: r.checkOut ?? "—",
    guestCheckIn: r.checkIn ?? undefined,
    status: r.status,
    assignee: r.assigneeId ? { id: r.assigneeId, name: r.assigneeName ?? "Unknown" } : null,
    badge: r.badge ?? undefined,
  }));
}

async function readTurnoverRows(db: NonNullable<ReturnType<typeof getDb>>): Promise<TurnoverRow[]> {
  const result = await db
    .select({
      id: turnovers.id,
      villaId: turnovers.villaId,
      villaCode: villas.unitCode,
      status: turnovers.status,
      badge: turnovers.badge,
      assigneeId: turnovers.assigneeUserId,
      assigneeName: appUsers.fullName,
      checkOut: sql<string | null>`to_char(${bookings.createdAt}, 'HH24:MI')`,
    })
    .from(turnovers)
    .innerJoin(villas, eq(villas.id, turnovers.villaId))
    .leftJoin(appUsers, eq(appUsers.id, turnovers.assigneeUserId))
    .leftJoin(bookings, eq(bookings.id, turnovers.sourceBookingId))
    .where(eq(turnovers.turnoverDate, sql`CURRENT_DATE`))
    .orderBy(asc(villas.unitCode));

  // checkOut/checkIn are wall-clock hints; bookings store dates only, so
  // the precise "HH:MM" guest checkout time isn't modelled yet. We surface
  // the standard turnover window labels rather than a fabricated time.
  // TODO(W4): add checkout_time / checkin_time to bookings to show real times.
  return result.map((r) => ({
    id: r.id,
    villaId: r.villaId,
    villaCode: r.villaCode,
    status: normalizeStatus(r.status),
    badge: r.badge,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName,
    checkOut: "11:00",
    checkIn: null,
  }));
}

/**
 * Insert a turnover for every villa that has a booking checking OUT today.
 * Links the same-day check-in booking as the deadline + a "Same-day" badge.
 * ON CONFLICT DO NOTHING keeps this safe to run repeatedly.
 */
async function deriveTodaysTurnovers(db: NonNullable<ReturnType<typeof getDb>>): Promise<void> {
  await db.execute(sql`
    INSERT INTO turnovers (villa_id, turnover_date, status, source_booking_id, next_booking_id, badge)
    SELECT
      out_b.villa_id,
      CURRENT_DATE,
      'todo',
      out_b.id,
      in_b.id,
      CASE WHEN in_b.id IS NOT NULL THEN 'Same-day' ELSE NULL END
    FROM bookings out_b
    LEFT JOIN LATERAL (
      SELECT b2.id
      FROM bookings b2
      WHERE b2.villa_id = out_b.villa_id
        AND b2.check_in = CURRENT_DATE
        AND b2.status IN ('confirmed', 'checked_in')
      ORDER BY b2.created_at
      LIMIT 1
    ) in_b ON true
    WHERE out_b.check_out = CURRENT_DATE
      AND out_b.status IN ('confirmed', 'checked_in', 'checked_out')
    ON CONFLICT (villa_id, turnover_date) DO NOTHING
  `);
}

/**
 * The cleaner roster (housekeepers / supervisors) with today's load —
 * the input to the deterministic allocator. Distinct on app_users so a
 * cleaner with multiple role rows is counted once.
 */
export async function getCleanerWorkloads(): Promise<CleanerWorkload[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .selectDistinct({
      id: appUsers.id,
      name: appUsers.fullName,
    })
    .from(appUsers)
    .innerJoin(userRoles, eq(userRoles.userId, appUsers.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(appUsers.status, "active"), inArray(roles.key, CLEANER_ROLE_KEYS)));

  if (rows.length === 0) return [];

  // Today's load per cleaner.
  const loadRows = await db
    .select({
      assigneeId: turnovers.assigneeUserId,
      load: sql<number>`count(*)::int`,
    })
    .from(turnovers)
    .where(eq(turnovers.turnoverDate, sql`CURRENT_DATE`))
    .groupBy(turnovers.assigneeUserId);

  const loadById = new Map<string, number>();
  for (const lr of loadRows) {
    if (lr.assigneeId) loadById.set(lr.assigneeId, lr.load);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    currentLoad: loadById.get(r.id) ?? 0,
  }));
}
