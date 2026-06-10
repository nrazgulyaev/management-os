import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingHolds,
  directBookingRequests,
  type DirectBookingHold,
  type DirectBookingRequest,
} from "@/lib/db/schema/direct-booking";
import { villas, projects } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { getDepositForHold } from "./deposits";
import { enumerateStayNights } from "@/features/dynamic-pricing/quote-pure";

/**
 * Unified "direct booking" detail — keyed on the canonical hold entity.
 *
 * The existing per-hold (`/holds/[id]`) and per-request (`/requests/[id]`)
 * pages each show one slice. THIS read assembles the cross-channel
 * coverage + concierge + owner-statement context the channels mock §04
 * specifies, scoped to the caller's organization.
 */

export interface CoverageNight {
  /** YYYY-MM-DD */
  date: string;
  /** This direct stay covers the night (the hold itself). */
  direct: boolean;
  /** A non-direct (OTA / owner / maintenance) block covers the night. */
  otaBlocked: boolean;
}

export interface CoverageRow {
  /** Stable key for the block source, e.g. "direct_booking_hold". */
  sourceType: string;
  /** Human label, e.g. "Direct", "Airbnb sync", "Owner stay". */
  label: string;
  /** Whether this row is the direct hold itself. */
  isDirect: boolean;
  /** Per-night coverage flags aligned to `nights`. */
  nights: boolean[];
}

export interface DirectBookingDetail {
  hold: DirectBookingHold;
  request: DirectBookingRequest | null;
  villaName: string | null;
  villaCode: string | null;
  projectName: string | null;
  /** management_model: individual | pooled | hybrid — drives owner-statement context. */
  managementModel: string | null;
  /** Stay-window nights (YYYY-MM-DD), check-in inclusive → check-out exclusive. */
  nights: string[];
  /** Cross-channel coverage matrix (rows = block sources). */
  coverage: CoverageRow[];
  /** Count of distinct non-direct sources that block the window. */
  blockedSourceCount: number;
  deposit: {
    id: string;
    depositCode: string;
    status: string;
    amountMinor: bigint;
    currency: string;
  } | null;
  booking: { id: string; bookingCode: string; status: string } | null;
}

const SOURCE_LABELS: Record<string, string> = {
  direct_booking_hold: "Direct",
  booking: "Booking",
  channel_sync: "Channel sync",
  ota_import: "OTA import",
  owner_stay: "Owner stay",
  maintenance: "Maintenance",
  manual: "Manual block",
};

function labelForSource(sourceType: string | null, blockType: string): string {
  if (sourceType && SOURCE_LABELS[sourceType]) return SOURCE_LABELS[sourceType];
  if (SOURCE_LABELS[blockType]) return SOURCE_LABELS[blockType];
  return sourceType ?? blockType;
}

/**
 * Load the unified direct-booking detail for a hold, scoped to the
 * caller's organization. Returns null when the hold does not exist OR
 * belongs to a different org (no cross-tenant leakage). Holds whose
 * org anchor is still NULL (pre-0153 backfill) are visible to any org
 * — they predate tenancy threading.
 */
export async function getDirectBookingDetailByHoldId(
  holdId: string,
  organizationId: string,
): Promise<DirectBookingDetail | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      hold: directBookingHolds,
      villaName: villas.name,
      villaCode: villas.unitCode,
      managementModel: villas.managementModel,
      projectName: projects.name,
    })
    .from(directBookingHolds)
    .leftJoin(villas, eq(villas.id, directBookingHolds.villaId))
    .leftJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(directBookingHolds.id, holdId))
    .limit(1);
  if (!row) return null;

  // Tenant guard: reject holds owned by another org. NULL org = legacy,
  // pre-tenancy-backfill, so it stays visible.
  if (row.hold.organizationId && row.hold.organizationId !== organizationId) {
    return null;
  }

  const nights = enumerateStayNights(row.hold.checkIn, row.hold.checkOut);

  // Cross-channel coverage: every calendar block intersecting the stay
  // window, grouped by source. The direct hold's own block is flagged
  // separately so the strip can render "Direct" vs the OTA/owner rows.
  const startsAt = new Date(`${row.hold.checkIn}T00:00:00.000Z`);
  const endsAt = new Date(`${row.hold.checkOut}T00:00:00.000Z`);
  const blocks = await db
    .select({
      sourceType: villaCalendarBlocks.sourceType,
      sourceId: villaCalendarBlocks.sourceId,
      blockType: villaCalendarBlocks.blockType,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.villaId, row.hold.villaId),
        eq(villaCalendarBlocks.status, "active"),
        lte(villaCalendarBlocks.startsAt, endsAt),
        gte(villaCalendarBlocks.endsAt, startsAt),
      ),
    );

  // Build the matrix. Always include a "Direct" row for this hold.
  const directRow: CoverageRow = {
    sourceType: "direct_booking_hold",
    label: "Direct",
    isDirect: true,
    nights: nights.map(() => true),
  };
  const otherRows = new Map<string, CoverageRow>();
  let blockedSources = 0;
  for (const b of blocks) {
    const isOwnHold =
      b.sourceType === "direct_booking_hold" && b.sourceId === row.hold.id;
    if (isOwnHold) continue; // the direct row already covers this
    const key = `${b.sourceType ?? "manual"}:${b.blockType}`;
    let rowEntry = otherRows.get(key);
    if (!rowEntry) {
      rowEntry = {
        sourceType: b.sourceType ?? b.blockType,
        label: labelForSource(b.sourceType, b.blockType),
        isDirect: false,
        nights: nights.map(() => false),
      };
      otherRows.set(key, rowEntry);
      blockedSources += 1;
    }
    const bStart = b.startsAt.getTime();
    const bEnd = b.endsAt.getTime();
    nights.forEach((nIso, i) => {
      const nStart = new Date(`${nIso}T00:00:00.000Z`).getTime();
      const nEnd = nStart + 24 * 60 * 60 * 1000;
      if (bStart < nEnd && bEnd > nStart) rowEntry.nights[i] = true;
    });
  }

  const coverage: CoverageRow[] = [directRow, ...otherRows.values()];

  // Request (if the guest has been captured / submitted).
  const [request] = await db
    .select()
    .from(directBookingRequests)
    .where(eq(directBookingRequests.holdId, row.hold.id))
    .orderBy(desc(directBookingRequests.createdAt))
    .limit(1);

  // Deposit summary (manual settlement only — no PSP).
  const dep = await getDepositForHold(row.hold.id);

  // Linked booking, if converted.
  let booking: DirectBookingDetail["booking"] = null;
  const bookingId = row.hold.convertedBookingId ?? request?.bookingId ?? null;
  if (bookingId) {
    const [bk] = await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        status: bookings.status,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    booking = bk ?? null;
  }

  return {
    hold: row.hold,
    request: request ?? null,
    villaName: row.villaName ?? null,
    villaCode: row.villaCode ?? null,
    projectName: row.projectName ?? null,
    managementModel: row.managementModel ?? null,
    nights,
    coverage,
    blockedSourceCount: blockedSources,
    deposit: dep
      ? {
          id: dep.id,
          depositCode: dep.depositCode,
          status: dep.status,
          amountMinor: dep.amountMinor,
          currency: dep.currency,
        }
      : null,
    booking,
  };
}
