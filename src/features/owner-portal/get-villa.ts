/**
 * Phase 2.3 owner-03 — getVillaForOwner.
 *
 * Server fn that resolves a single villa for an owner. Validates
 * ownership (no silent leakage between owners) and assembles the
 * villa hero + photos + YTD + monthly + maintenance log into one
 * payload.
 *
 * Today reads against the existing owner-portal queries layer;
 * photos + maintenance log are mocked until the data PR wires
 * the `villa_photos` and `maintenance_tickets` joins.
 */

import "server-only";
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

export async function getVillaForOwner(
  ownerId: string,
  villaId: string,
): Promise<OwnerVillaResult | null> {
  const owned = await listMyVillas(ownerId).catch(() => []);
  const match = owned.find((v) => v.villaId === villaId);
  if (!match) return null;

  return {
    villa: {
      id: match.villaId,
      code: match.villaCode ?? "—",
      name: match.villaName ?? match.villaCode ?? "Villa",
      location: match.projectName ?? undefined,
      // Default amenities until the data PR pulls them from villas.amenities.
      bedrooms: 4,
      amenities: ["Pool", "Chef on call", "Driver", "Wi-Fi", "AC"],
      heroImageUrl: null,
    },
    photos: [],
    ytdStats: {
      occupancyPct: Math.round(match.occupancyPct),
      netUsd: Number(match.mtdNetUsdMinor) / 100,
      adrUsd: Number(match.adrUsdMinor) / 100,
    },
    monthlyStats: [],
    recentMaintenance: [],
  };
}
