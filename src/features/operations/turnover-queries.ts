import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { turnovers } from "@/lib/db/schema/turnovers";
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { requireOrgId } from "@/features/auth/require-org";
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

/**
 * Property-STANDARD turnover window. bookings store check_in/check_out as a
 * DATE only (no per-booking time column), and neither villas/projects nor a
 * property-settings table carry a standard time today. These are therefore the
 * house default check-out / check-in clock — NOT a per-booking fact. The board
 * labels them as the standard window so we never present a fabricated per-stay
 * time. To show real per-booking times, add checkout_time/checkin_time to
 * bookings (see the skipped migration note).
 */
const STD_CHECKOUT = "11:00";
const STD_CHECKIN = "14:00";

/** A turnover row joined to the villa code + assignee name, board-ready. */
export interface TurnoverRow {
  id: string;
  villaId: string;
  villaCode: string;
  status: TurnoverStatus;
  badge: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  /** Property-STANDARD checkout time (house default, not a per-booking fact). */
  checkOut: string | null;
  /** Property-STANDARD check-in time — only set when a same-day arrival exists. */
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
  const organizationId = await requireOrgId();

  let rows = await readTurnoverRows(db, organizationId);
  if (rows.length === 0) {
    await deriveTodaysTurnovers(db, organizationId);
    rows = await readTurnoverRows(db, organizationId);
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

async function readTurnoverRows(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
): Promise<TurnoverRow[]> {
  const result = await db
    .select({
      id: turnovers.id,
      villaId: turnovers.villaId,
      villaCode: villas.unitCode,
      status: turnovers.status,
      badge: turnovers.badge,
      assigneeId: turnovers.assigneeUserId,
      assigneeName: appUsers.fullName,
      // Drives whether a same-day arrival exists for this villa.
      nextBookingId: turnovers.nextBookingId,
    })
    .from(turnovers)
    .innerJoin(villas, eq(villas.id, turnovers.villaId))
    // TENANCY: turnovers has no organization_id — scope via villa → project.
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .leftJoin(appUsers, eq(appUsers.id, turnovers.assigneeUserId))
    .where(
      and(
        eq(turnovers.turnoverDate, sql`CURRENT_DATE`),
        eq(projects.organizationId, organizationId),
      ),
    )
    .orderBy(asc(villas.unitCode));

  // bookings store check_in/check_out as DATE only — there's no per-booking
  // checkout/check-in TIME column, and no property-settings table carries a
  // standard one. So we surface the property-STANDARD window (STD_CHECKOUT /
  // STD_CHECKIN) rather than a fabricated per-stay time, and only show the
  // standard check-in when a same-day arrival actually exists (next_booking_id).
  // TODO(W4): add checkout_time / checkin_time to bookings for real per-stay times.
  return result.map((r) => ({
    id: r.id,
    villaId: r.villaId,
    villaCode: r.villaCode,
    status: normalizeStatus(r.status),
    badge: r.badge,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName,
    checkOut: STD_CHECKOUT,
    checkIn: r.nextBookingId ? STD_CHECKIN : null,
  }));
}

/**
 * Insert a turnover for every villa that has a booking checking OUT today.
 * Links the same-day check-in booking as the deadline + a "Same-day" badge.
 * ON CONFLICT DO NOTHING keeps this safe to run repeatedly.
 */
async function deriveTodaysTurnovers(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
): Promise<void> {
  // TENANCY: only derive turnovers from this org's bookings (out_b + in_b
  // both scoped) so the INSERT can't seed cross-org rows.
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
        AND b2.organization_id = ${organizationId}::uuid
      ORDER BY b2.created_at
      LIMIT 1
    ) in_b ON true
    WHERE out_b.check_out = CURRENT_DATE
      AND out_b.status IN ('confirmed', 'checked_in', 'checked_out')
      AND out_b.organization_id = ${organizationId}::uuid
    ON CONFLICT (villa_id, turnover_date) DO NOTHING
  `);
}

/**
 * The cleaner roster (housekeepers / supervisors) with today's load —
 * the input to the deterministic allocator. Distinct on app_users so a
 * cleaner with multiple role rows is counted once.
 *
 * TENANCY (CRON CAVEAT): this is a SHARED reader — the request/page path
 * (cleaner picker on /dashboard/operations/turnovers) calls it with no
 * args and the org defaults to `requireOrgId()`, while the turnover-
 * allocator cron passes its explicit `organizationId`. Both the roster
 * SELECT (app_users.organization_id, NOT NULL + indexed) and the
 * per-cleaner load count (turnovers → villa → project.organization_id)
 * are scoped so a tenant only ever sees its own housekeepers + load.
 */
export async function getCleanerWorkloads(
  organizationId: string | null = null,
): Promise<CleanerWorkload[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = organizationId ?? (await requireOrgId());

  const rows = await db
    .selectDistinct({
      id: appUsers.id,
      name: appUsers.fullName,
    })
    .from(appUsers)
    .innerJoin(userRoles, eq(userRoles.userId, appUsers.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(appUsers.organizationId, orgId),
        eq(appUsers.status, "active"),
        inArray(roles.key, CLEANER_ROLE_KEYS),
      ),
    );

  if (rows.length === 0) return [];

  // Today's load per cleaner — scoped to this org via villa → project so a
  // cleaner's count can't be inflated by another tenant's turnovers.
  const loadRows = await db
    .select({
      assigneeId: turnovers.assigneeUserId,
      load: sql<number>`count(*)::int`,
    })
    .from(turnovers)
    .innerJoin(villas, eq(villas.id, turnovers.villaId))
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(turnovers.turnoverDate, sql`CURRENT_DATE`),
        eq(projects.organizationId, orgId),
      ),
    )
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
