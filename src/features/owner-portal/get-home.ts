/**
 * Phase 2.3 owner-01 — getOwnerHome.
 *
 * Server fn that aggregates the data the owner home renders:
 *   ytdNet              · sum of net-to-owner across statements YTD
 *   pendingStatement?   · most-recent statement in "draft" or "issued"
 *   nextStatementDate   · next-period close + 5 days
 *   villas              · ownership_shares × villas summary
 *   upcoming            · next 5 bookings across all owned villas
 *   recentActivity      · 7 newest events on the owner timeline
 *
 * Cached 5 min — the owner home is the most-visited page in the
 * Owner Portal but the data underneath only churns a few times
 * per day.
 *
 * Today the function reads from existing owner-portal-queries (live)
 * with a small mock layer for the bits 2.3 needs but the DB doesn't
 * yet surface (recent activity, pending statement banner). The
 * mock layer disappears once the data PR lands.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import {
  getOwnerDashboardKpis,
  listMyStatements,
  listMyVillas,
} from "@/features/owner-portal/owner-portal-queries";

export interface OwnerHomeUpcoming {
  id: string;
  href: string;
  dateLabel: string;
  guest: string;
  villaCode: string;
  nights: number;
  state?: string;
}

export interface OwnerHomeVilla {
  id: string;
  href: string;
  code: string;
  name: string;
  bedrooms: number;
  occupancyPct: number;
  netUsd: number;
  location?: string;
  imageUrl?: string | null;
}

export interface OwnerHomeActivity {
  id: string;
  when: string;
  what: string;
}

export interface OwnerHome {
  ytdNetUsd: number;
  pendingStatement?: {
    statementCode: string;
    href: string;
    netUsd: number;
    periodLabel: string;
  } | null;
  nextStatementLabel: string;
  villas: OwnerHomeVilla[];
  upcoming: OwnerHomeUpcoming[];
  recentActivity: OwnerHomeActivity[];
}

async function readHome(ownerId: string): Promise<OwnerHome> {
  const [kpis, statements, villas] = await Promise.all([
    getOwnerDashboardKpis(ownerId).catch(() => null),
    listMyStatements(ownerId).catch(() => []),
    listMyVillas(ownerId).catch(() => []),
  ]);

  // YTD net not yet surfaced by the queries layer; sum the YTD
  // statements client-side (the data PR adds a dedicated rollup).
  const thisYear = new Date().getFullYear();
  const ytdNetUsd = statements
    .filter((s) => s.periodMonth.startsWith(String(thisYear)))
    .reduce((n, s) => n + Number(s.netToOwnerUsdMinor) / 100, 0);

  const pending = statements.find((s) => s.status === "draft" || s.status === "issued");

  const today = new Date();
  const nextStmt = new Date(today.getFullYear(), today.getMonth() + 1, 5);

  void kpis; // referenced for future expansion (occupancy / ADR badges)

  return {
    ytdNetUsd,
    pendingStatement: pending
      ? {
          statementCode: pending.statementCode,
          href: `/owner/statements/${pending.statementId}`,
          netUsd: Number(pending.netToOwnerUsdMinor) / 100,
          periodLabel: pending.monthLabel,
        }
      : null,
    nextStatementLabel: nextStmt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    villas: villas.map((v) => ({
      id: v.villaId,
      href: `/owner/villas/${v.villaId}`,
      code: v.villaCode ?? "—",
      name: v.villaName ?? v.villaCode ?? "Villa",
      bedrooms: 0, // surfaced from `villas` join in the data PR
      occupancyPct: Math.round(v.occupancyPct),
      netUsd: Number(v.mtdNetUsdMinor) / 100,
      location: v.projectName ?? undefined,
      imageUrl: null,
    })),
    // PR 2.3 owner-01 — upcoming + recent activity are mocked for
    // now. Real reads against bookings + owner_activity_log land
    // in the data PR.
    upcoming: [],
    recentActivity: [],
  };
}

export const getOwnerHome = unstable_cache(readHome, ["owner-home"], { revalidate: 300 });
