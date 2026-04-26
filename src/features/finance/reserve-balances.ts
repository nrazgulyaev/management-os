import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reserveMovements } from "@/lib/db/schema/finance";
import type { WithSource } from "@/features/types";

export interface ReserveBalanceRow {
  villaId: string | null;
  projectId: string | null;
  ownerId: string | null;
  reserveType: string;
  currency: string;
  contributionsMinor: bigint;
  releasesMinor: bigint;
  adjustmentsMinor: bigint;
  balanceMinor: bigint;
  lastMovementDate: string | null;
}

/**
 * Aggregate posted `reserve_movements` into running balances per
 * (villa_id, project_id, owner_id, reserve_type, currency). Mirrors the SQL
 * view `v_reserve_balances` so the app keeps working when the view is not
 * yet present (e.g. early in migration cycles).
 */
export async function listReserveBalances(): Promise<WithSource<ReserveBalanceRow>[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      villaId: reserveMovements.villaId,
      projectId: reserveMovements.projectId,
      ownerId: reserveMovements.ownerId,
      reserveType: reserveMovements.reserveType,
      currency: reserveMovements.currency,
      contributions: sql<string>`SUM(CASE WHEN ${reserveMovements.movementType} = 'contribution' THEN ${reserveMovements.amountMinor} ELSE 0 END)`,
      releases: sql<string>`SUM(CASE WHEN ${reserveMovements.movementType} = 'release' THEN ${reserveMovements.amountMinor} ELSE 0 END)`,
      adjustments: sql<string>`SUM(CASE WHEN ${reserveMovements.movementType} = 'adjustment' THEN ${reserveMovements.amountMinor} ELSE 0 END)`,
      balance: sql<string>`SUM(CASE WHEN ${reserveMovements.movementType} = 'contribution' THEN ${reserveMovements.amountMinor} WHEN ${reserveMovements.movementType} = 'release' THEN -${reserveMovements.amountMinor} WHEN ${reserveMovements.movementType} = 'adjustment' THEN ${reserveMovements.amountMinor} ELSE 0 END)`,
      lastMovement: sql<string>`MAX(${reserveMovements.movementDate})`,
    })
    .from(reserveMovements)
    .where(eq(reserveMovements.status, "posted"))
    .groupBy(
      reserveMovements.villaId,
      reserveMovements.projectId,
      reserveMovements.ownerId,
      reserveMovements.reserveType,
      reserveMovements.currency,
    );

  return rows.map((r) => ({
    source: "db" as const,
    villaId: r.villaId,
    projectId: r.projectId,
    ownerId: r.ownerId,
    reserveType: r.reserveType,
    currency: r.currency,
    contributionsMinor: BigInt(r.contributions ?? 0),
    releasesMinor: BigInt(r.releases ?? 0),
    adjustmentsMinor: BigInt(r.adjustments ?? 0),
    balanceMinor: BigInt(r.balance ?? 0),
    lastMovementDate: r.lastMovement ?? null,
  }));
}
