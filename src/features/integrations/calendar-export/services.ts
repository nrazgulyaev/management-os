import "server-only";

import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villaIcalExportTokens } from "@/lib/db/schema/integrations";
import { villas, projects } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { requireOrgId } from "@/features/auth/require-org";
import { hashFeedToken } from "./token";
import {
  buildAvailabilityIcs,
  utcDateFloor,
  utcDateCeil,
  type IcsAllDayEvent,
} from "./ics";

/**
 * ICAL-EXPORT-1 — server reads for the outbound availability feed.
 *
 * The public route authenticates by capability token (SHA-256 hash lookup —
 * no session), then serves the villa's BLOCKING events:
 *   · bookings in confirmed/checked_in with check_out >= today (DATE-only
 *     columns → all-day events, DTEND exclusive = check_out);
 *   · active villa_calendar_blocks that are NOT booking mirrors
 *     (source_type='booking' rows are written by availability-sync from the
 *     same bookings — exporting both would double-block).
 * PRIVACY: summaries are generic ("Reserved"/"Blocked") — never guest names.
 *
 * TENANCY: the token row carries organization_id; every downstream read is
 * scoped to it AND to the token's villa, so one villa's feed can never leak
 * another villa's (or another org's) calendar.
 */

const BLOCKING_BOOKING_STATUSES = ["confirmed", "checked_in"] as const;

export interface ExportFeedCalendar {
  icsBody: string;
  villaCode: string;
}

export async function loadIcsCalendarByToken(
  rawToken: string,
  now: Date = new Date(),
): Promise<ExportFeedCalendar | null> {
  const db = getDb();
  if (!db) return null;
  // Defensive shape check before hashing (43-char base64url).
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) return null;

  const tokenHash = hashFeedToken(rawToken);
  const [row] = await db
    .select({
      id: villaIcalExportTokens.id,
      villaId: villaIcalExportTokens.villaId,
      organizationId: villaIcalExportTokens.organizationId,
    })
    .from(villaIcalExportTokens)
    .where(
      and(
        eq(villaIcalExportTokens.tokenHash, tokenHash),
        eq(villaIcalExportTokens.isActive, true),
      ),
    )
    .limit(1);
  if (!row) return null;

  // Resolve villa (scoped through project → org, the villas tenancy anchor).
  const [villa] = await db
    .select({ id: villas.id, unitCode: villas.unitCode, name: villas.name })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(villas.id, row.villaId),
        eq(projects.organizationId, row.organizationId),
      ),
    )
    .limit(1);
  if (!villa) return null;

  const today = utcDateFloor(now);

  const [bookingRows, blockRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.villaId, row.villaId),
          eq(bookings.organizationId, row.organizationId),
          inArray(bookings.status, [...BLOCKING_BOOKING_STATUSES]),
          gte(bookings.checkOut, today),
        ),
      ),
    db
      .select({
        id: villaCalendarBlocks.id,
        startsAt: villaCalendarBlocks.startsAt,
        endsAt: villaCalendarBlocks.endsAt,
        blockType: villaCalendarBlocks.blockType,
      })
      .from(villaCalendarBlocks)
      .where(
        and(
          eq(villaCalendarBlocks.villaId, row.villaId),
          eq(villaCalendarBlocks.status, "active"),
          gte(villaCalendarBlocks.endsAt, now),
          // Booking mirrors are exported from `bookings` directly.
          or(
            isNull(villaCalendarBlocks.sourceType),
            ne(villaCalendarBlocks.sourceType, "booking"),
          ),
        ),
      ),
  ]);

  const events: IcsAllDayEvent[] = [
    ...bookingRows.map((b) => ({
      uid: `booking-${b.id}`,
      startDate: String(b.checkIn),
      endDateExclusive: String(b.checkOut),
      summary: "Reserved",
    })),
    ...blockRows.map((b) => ({
      uid: `block-${b.id}`,
      startDate: utcDateFloor(b.startsAt as unknown as Date),
      endDateExclusive: utcDateCeil(b.endsAt as unknown as Date),
      summary: "Blocked (unavailable)",
    })),
  ];

  const icsBody = buildAvailabilityIcs({
    calendarName: `${villa.unitCode} · Arconique availability`,
    events,
    now,
  });

  // Best-effort access stats — never block the feed on this write.
  db.update(villaIcalExportTokens)
    .set({
      lastAccessedAt: now,
      accessCount: sql`${villaIcalExportTokens.accessCount} + 1`,
    })
    .where(eq(villaIcalExportTokens.id, row.id))
    .catch(() => {});

  return { icsBody, villaCode: villa.unitCode };
}

/** Feed status per villa for the management UI (org-scoped). */
export interface VillaFeedStatus {
  villaId: string;
  villaLabel: string;
  tokenPrefix: string | null;
  createdAt: Date | null;
  lastAccessedAt: Date | null;
  accessCount: number;
}

export async function listIcalExportFeeds(): Promise<VillaFeedStatus[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const villaRows = await db
    .select({
      id: villas.id,
      unitCode: villas.unitCode,
      name: villas.name,
      projectName: projects.name,
    })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(projects.organizationId, organizationId))
    .orderBy(villas.unitCode);

  const tokenRows = await db
    .select()
    .from(villaIcalExportTokens)
    .where(
      and(
        eq(villaIcalExportTokens.organizationId, organizationId),
        eq(villaIcalExportTokens.isActive, true),
      ),
    )
    .orderBy(desc(villaIcalExportTokens.createdAt));

  const byVilla = new Map(tokenRows.map((t) => [t.villaId, t]));
  return villaRows.map((v) => {
    const t = byVilla.get(v.id);
    return {
      villaId: v.id,
      villaLabel: `${v.unitCode}${v.projectName ? ` · ${v.projectName}` : ""}`,
      tokenPrefix: t?.tokenPrefix ?? null,
      createdAt: t?.createdAt ?? null,
      lastAccessedAt: t?.lastAccessedAt ?? null,
      accessCount: t?.accessCount ?? 0,
    };
  });
}
