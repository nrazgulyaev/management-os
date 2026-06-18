/**
 * Phase 2.3 owner-03 / Packet C PR 1 — getVillaForOwner.
 *
 * Server fn that resolves a single villa for an owner. Validates
 * ownership (no silent leakage between owners) and assembles the
 * villa hero + photos + YTD + monthly + maintenance log into one
 * payload.
 *
 * Packet C wires:
 *   - photos              → villa_photos (filtered to visible_to_owner)
 *   - recentMaintenance   → maintenance_tickets (closed_at within 12mo)
 *
 * Owner-portal functional wave wires:
 *   - villa.bedrooms / .features → real villas-row columns (bedrooms,
 *     bathrooms, pool_area_sqm, view_type). No fabricated amenity list.
 *   - monthlyStats        → per-month booked-nights occupancy rollup
 *     over the trailing 6 months for this single villa (same booking
 *     status set + check_in anchoring as listMyVillas / dashboard KPIs).
 */

import "server-only";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { villas } from "@/lib/db/schema/projects";
import { villaPhotos } from "@/lib/db/schema/villa-photos";
import { maintenanceTickets } from "@/lib/db/schema/operations";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";

export interface OwnerVillaPhoto {
  id: string;
  url: string;
  alt?: string;
  caption?: string;
  visibleToOwner: boolean;
}

export interface OwnerVillaMonthly {
  /** "Oct", "Nov", "Dec", "Jan", "Feb", "Mar" */
  monthLabel: string;
  occupancyPct: number;
  netUsd: number;
}

export interface OwnerVillaMaintenance {
  id: string;
  date: string;
  summary: string;
  costUsd: number;
  status: string;
  visibleToOwner: boolean;
}

export interface OwnerVillaResult {
  villa: {
    id: string;
    code: string;
    name: string;
    location?: string;
    bedrooms: number;
    /**
     * Honest, derived feature chips built ONLY from real villas-row
     * columns that are actually populated (bedrooms / bathrooms / pool /
     * view). Empty when the villa carries no structured features — the
     * hero then renders no chips rather than a fabricated amenity list.
     */
    amenities: string[];
    heroImageUrl: string | null;
  };
  photos: OwnerVillaPhoto[];
  ytdStats: {
    occupancyPct: number;
    netUsd: number;
    adrUsd: number;
  };
  monthlyStats: OwnerVillaMonthly[];
  recentMaintenance: OwnerVillaMaintenance[];
}

const PHOTO_KIND_PRIORITY: Record<string, number> = {
  hero: 0,
  gallery: 1,
  aerial: 2,
  outside: 3,
  room: 4,
  floorplan: 5,
};

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function getVillaForOwner(
  ownerId: string,
  villaId: string,
): Promise<OwnerVillaResult | null> {
  const owned = await listMyVillas(ownerId).catch(() => []);
  const match = owned.find((v) => v.villaId === villaId);
  if (!match) return null;

  const db = getDb();
  let photos: OwnerVillaPhoto[] = [];
  let recentMaintenance: OwnerVillaMaintenance[] = [];
  let monthlyStats: OwnerVillaMonthly[] = [];
  // Real structured villa attributes (defaults mirror the listMyVillas row;
  // overwritten from the villas table below when the DB is reachable).
  let bedrooms = match.bedrooms ?? 0;
  let amenities: string[] = [];

  if (db) {
    // Real villa-row attributes — bedrooms + a few structured features.
    // The owner ↔ villa link is already validated above (listMyVillas), so
    // this is a scoped read of a villa the caller owns.
    const villaRows = await db
      .select({
        bedrooms: villas.bedrooms,
        bathrooms: villas.bathrooms,
        poolAreaSqm: villas.poolAreaSqm,
        viewType: villas.viewType,
      })
      .from(villas)
      .where(eq(villas.id, villaId))
      .limit(1);
    const vr = villaRows[0];
    if (vr) {
      bedrooms = vr.bedrooms ?? bedrooms;
      // Honest feature chips: only emit a chip when the underlying real
      // column is populated. Never fabricate amenities the row doesn't carry.
      const chips: string[] = [];
      const bathroomsNum = vr.bathrooms != null ? Number(vr.bathrooms) : 0;
      if (bathroomsNum > 0) {
        const rounded = Math.round(bathroomsNum * 10) / 10;
        chips.push(`${rounded} bath${rounded === 1 ? "" : "s"}`);
      }
      if (vr.poolAreaSqm != null && Number(vr.poolAreaSqm) > 0) {
        chips.push("Private pool");
      }
      if (vr.viewType && vr.viewType !== "other") {
        // ocean | rice_field | jungle | garden → "Ocean view" etc.
        const label = vr.viewType.replace(/_/g, " ");
        chips.push(`${label.charAt(0).toUpperCase()}${label.slice(1)} view`);
      }
      amenities = chips;
    }

    const photoRows = await db
      .select({
        id: villaPhotos.id,
        url: villaPhotos.url,
        caption: villaPhotos.caption,
        kind: villaPhotos.kind,
        position: villaPhotos.position,
        visibleToOwner: villaPhotos.visibleToOwner,
      })
      .from(villaPhotos)
      .where(and(eq(villaPhotos.villaId, villaId), eq(villaPhotos.visibleToOwner, true)))
      .limit(60);
    photoRows.sort((a, b) => {
      const ka = PHOTO_KIND_PRIORITY[a.kind] ?? 9;
      const kb = PHOTO_KIND_PRIORITY[b.kind] ?? 9;
      if (ka !== kb) return ka - kb;
      return a.position - b.position;
    });
    photos = photoRows.slice(0, 24).map((r) => ({
      id: r.id,
      url: r.url,
      caption: r.caption ?? undefined,
      visibleToOwner: r.visibleToOwner,
    }));

    const twelveMonthsAgo = new Date(Date.now() - ONE_YEAR_MS);
    const ticketRows = await db
      .select({
        id: maintenanceTickets.id,
        title: maintenanceTickets.title,
        closedAt: maintenanceTickets.closedAt,
        status: maintenanceTickets.status,
        actualCostMinor: maintenanceTickets.actualCostMinor,
        ownerChargeable: maintenanceTickets.ownerChargeable,
      })
      .from(maintenanceTickets)
      .where(
        and(
          eq(maintenanceTickets.villaId, villaId),
          isNotNull(maintenanceTickets.closedAt),
          gte(maintenanceTickets.closedAt, twelveMonthsAgo),
        ),
      )
      .orderBy(desc(maintenanceTickets.closedAt))
      .limit(12);
    recentMaintenance = ticketRows.map((t) => ({
      id: t.id,
      date: t.closedAt ? new Date(t.closedAt).toISOString().slice(0, 10) : "",
      summary: t.title,
      // Owner sees their cost share — actual cost only when the ticket
      // was tagged owner-chargeable. Amounts stored as IDR minor; convert
      // to USD with the same 15,800 IDR/USD pin owner-portal-queries uses.
      costUsd: t.ownerChargeable && t.actualCostMinor != null
        ? Number(t.actualCostMinor) / 100 / 15800
        : 0,
      status: t.status,
      visibleToOwner: true,
    }));

    monthlyStats = await buildMonthlyOccupancy(db, villaId);
  }

  const heroPhoto = photos.find((p) => p.url) ?? null;

  return {
    villa: {
      id: match.villaId,
      code: match.villaCode ?? "—",
      name: match.villaName ?? match.villaCode ?? "Villa",
      location: match.projectName ?? undefined,
      bedrooms,
      amenities,
      heroImageUrl: heroPhoto?.url ?? null,
    },
    photos,
    ytdStats: {
      occupancyPct: Math.round(match.occupancyPct),
      netUsd: Number(match.mtdNetUsdMinor) / 100,
      adrUsd: Number(match.adrUsdMinor) / 100,
    },
    monthlyStats,
    recentMaintenance,
  };
}

/**
 * Per-month occupancy for a single villa over the trailing 6 calendar
 * months (oldest → newest). Occupancy = booked nights anchored to the
 * booking's check-in month ÷ days in that month, capped at 100% — the
 * same booking status set + check_in anchoring listMyVillas uses for the
 * MTD figure. For the current (partial) month the denominator is the
 * number of days elapsed so the bar reflects a real rate, not a deflated
 * one.
 *
 * All 6 buckets are returned (a genuine 0%-occupancy month is real data
 * worth charting), BUT only when the villa has at least one booking in
 * the window — when it has none, the whole rollup is meaningless, so we
 * return [] and the page hides the panel entirely (no permanent dead
 * "No occupancy data yet." empty-state).
 */
async function buildMonthlyOccupancy(
  db: NonNullable<ReturnType<typeof getDb>>,
  villaId: string,
): Promise<OwnerVillaMonthly[]> {
  const now = new Date();
  // Build the 6 trailing month buckets in UTC (oldest first).
  const buckets: { iso: string; year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      iso: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
    });
  }
  const windowStart = `${buckets[0].iso}-01`;

  const rows = await db.execute<{ month: string; nights: string }>(sql`
    SELECT to_char(date_trunc('month', b.check_in), 'YYYY-MM') AS month,
           COALESCE(SUM(b.nights), 0)::text                     AS nights
      FROM bookings b
     WHERE b.villa_id = ${villaId}::uuid
       AND b.status IN ('confirmed','checked_in','checked_out')
       AND b.check_in >= ${windowStart}::date
     GROUP BY 1
  `);
  const byMonth = new Map(
    rowsOf<{ month: string; nights: string }>(rows).map((r) => [r.month, Number(r.nights || 0)]),
  );

  // No bookings anywhere in the window → no real series; hide the panel.
  let totalNights = 0;
  for (const n of byMonth.values()) totalNights += n;
  if (totalNights <= 0) return [];

  const todayUtcDate = now.getUTCDate();
  const currentIso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  return buckets.map((b) => {
    const nights = byMonth.get(b.iso) ?? 0;
    const daysInMonth = new Date(Date.UTC(b.year, b.month, 0)).getUTCDate();
    const denom = b.iso === currentIso ? Math.max(1, todayUtcDate) : daysInMonth;
    const pct = Math.min(100, Math.round((nights / denom) * 100));
    const label = new Date(Date.UTC(b.year, b.month - 1, 1)).toLocaleString("en", {
      month: "short",
    });
    return { monthLabel: label, occupancyPct: pct, netUsd: 0 };
  });
}
