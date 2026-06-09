import "server-only";

import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villaPoolState, POOL_COOLING_OFF_DAYS } from "@/lib/db/schema/villa-pool-state";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";

/**
 * P1 owner-calendar-pool — read-side for the interactive pool manager.
 *
 * For each villa the current owner holds, resolves the *effective* pool
 * status (accounting for the 14-day cooling-off window): while a toggle
 * is cooling off, the villa keeps its current `poolStatus` and surfaces
 * the `pendingStatus` + `coolingOffUntil` so the UI can show "Returning
 * to pool in 9 days". Ownership scope is enforced by `listMyVillas`.
 */

export type EffectivePoolStatus = "in_pool" | "out_of_pool";

export interface VillaPoolRow {
  villaId: string;
  villaCode: string | null;
  villaName: string | null;
  /** Effective state right now (the pending state only applies once cooling-off elapses). */
  status: EffectivePoolStatus;
  /** The state being transitioned to, while cooling off. Null when stable. */
  pendingStatus: EffectivePoolStatus | null;
  /** ISO instant the pending transition becomes effective. Null when stable. */
  coolingOffUntil: string | null;
  /** True while a toggle is within its 14-day cooling-off window. */
  isCoolingOff: boolean;
  /** Whole days remaining in the cooling-off window (0 when none). */
  coolingOffDaysRemaining: number;
}

export interface OwnerPoolState {
  villas: VillaPoolRow[];
  coolingOffDays: number;
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / 86_400_000));
}

export async function getOwnerPoolState(ownerId: string): Promise<OwnerPoolState> {
  const owned = await listMyVillas(ownerId).catch(() => []);
  const db = getDb();

  const base: OwnerPoolState = { villas: [], coolingOffDays: POOL_COOLING_OFF_DAYS };
  if (owned.length === 0) return base;

  const villaIds = owned.map((v) => v.villaId);
  const stateByVilla = new Map<
    string,
    { poolStatus: string; pendingStatus: string | null; coolingOffUntil: Date | null }
  >();

  if (db) {
    const rows = await db
      .select({
        villaId: villaPoolState.villaId,
        poolStatus: villaPoolState.poolStatus,
        pendingStatus: villaPoolState.pendingStatus,
        coolingOffUntil: villaPoolState.coolingOffUntil,
      })
      .from(villaPoolState)
      .where(inArray(villaPoolState.villaId, villaIds));
    for (const r of rows) {
      stateByVilla.set(r.villaId, {
        poolStatus: r.poolStatus,
        pendingStatus: r.pendingStatus,
        coolingOffUntil: r.coolingOffUntil,
      });
    }
  }

  const now = Date.now();
  const villasOut: VillaPoolRow[] = owned.map((v) => {
    const s = stateByVilla.get(v.villaId);
    // No row yet → default in-pool, no pending transition.
    const effective: EffectivePoolStatus =
      s?.poolStatus === "out_of_pool" ? "out_of_pool" : "in_pool";

    const coolingUntilMs = s?.coolingOffUntil ? s.coolingOffUntil.getTime() : null;
    const isCoolingOff =
      !!s?.pendingStatus && coolingUntilMs !== null && coolingUntilMs > now;

    return {
      villaId: v.villaId,
      villaCode: v.villaCode,
      villaName: v.villaName,
      status: effective,
      pendingStatus: isCoolingOff
        ? s!.pendingStatus === "out_of_pool"
          ? "out_of_pool"
          : "in_pool"
        : null,
      coolingOffUntil: isCoolingOff ? s!.coolingOffUntil!.toISOString() : null,
      isCoolingOff,
      coolingOffDaysRemaining: isCoolingOff ? daysBetween(now, coolingUntilMs!) : 0,
    };
  });

  return { villas: villasOut, coolingOffDays: POOL_COOLING_OFF_DAYS };
}

export interface UpcomingOwnerStayRow {
  id: string;
  villaId: string;
  villaCode: string | null;
  start: string;
  end: string;
  status: string;
}

/** Cancellable owner-stay statuses (pre-completion). */
const CANCELLABLE_STATUSES = [
  "requested",
  "pending_admin_approval",
  "availability_check",
  "requires_relocation",
  "approved",
  "confirmed",
] as const;

/**
 * Upcoming (today onward) cancellable owner stays for the pool-manager's
 * cancel-stay control. Scoped to the owner's villas.
 */
export async function getUpcomingOwnerStays(
  ownerId: string,
): Promise<UpcomingOwnerStayRow[]> {
  const owned = await listMyVillas(ownerId).catch(() => []);
  const db = getDb();
  if (!db || owned.length === 0) return [];

  const villaIds = owned.map((v) => v.villaId);
  const codeByVilla = new Map(owned.map((v) => [v.villaId, v.villaCode]));
  const todayIso = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: ownerStayRequests.id,
      villaId: ownerStayRequests.villaId,
      start: ownerStayRequests.requestedStart,
      end: ownerStayRequests.requestedEnd,
      status: ownerStayRequests.status,
    })
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.ownerId, ownerId),
        inArray(ownerStayRequests.villaId, villaIds),
        inArray(ownerStayRequests.status, [...CANCELLABLE_STATUSES]),
        gte(ownerStayRequests.requestedEnd, todayIso),
      ),
    )
    .orderBy(asc(ownerStayRequests.requestedStart))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    villaId: r.villaId,
    villaCode: codeByVilla.get(r.villaId) ?? null,
    start: r.start,
    end: r.end,
    status: r.status,
  }));
}
