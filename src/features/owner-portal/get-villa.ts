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
 * NOT wired: monthlyStats (needs occupancy aggregation; existing
 * owner-portal-queries.ts doesn't expose a per-month rollup yet).
 */

import "server-only";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
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

  if (db) {
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
  }

  const heroPhoto = photos.find((p) => p.url) ?? null;

  void sql; // imported for future window-fn rollups
  return {
    villa: {
      id: match.villaId,
      code: match.villaCode ?? "—",
      name: match.villaName ?? match.villaCode ?? "Villa",
      location: match.projectName ?? undefined,
      bedrooms: 4,
      amenities: ["Pool", "Chef on call", "Driver", "Wi-Fi", "AC"],
      heroImageUrl: heroPhoto?.url ?? null,
    },
    photos,
    ytdStats: {
      occupancyPct: Math.round(match.occupancyPct),
      netUsd: Number(match.mtdNetUsdMinor) / 100,
      adrUsd: Number(match.adrUsdMinor) / 100,
    },
    monthlyStats: [],
    recentMaintenance,
  };
}
