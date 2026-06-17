"use server";

/**
 * Wire-up sweep — "use server" adapter for the server-only
 * createRevenueStream action. Accepts form-friendly numbers (major
 * units), builds BigInt minor server-side, normalizes the thrown action
 * into {ok,error}, and revalidates.
 */

import { revalidatePath } from "next/cache";
import {
  createRevenueStream,
  updateRevenueStream,
  deleteRevenueStream,
} from "@/lib/development/server/revenue-streams/revenue-stream-actions";

type StreamType =
  | "hotel_room_revenue"
  | "restaurant_revenue"
  | "spa_revenue"
  | "rental_income"
  | "service_fee"
  | "membership_fee"
  | "event_revenue"
  | "other";

export interface CreateRevenueStreamFormInput {
  assetId: string;
  projectId: string;
  streamType: StreamType;
  periodStart: string;
  periodEnd: string;
  grossRevenueMajor: number;
  directCostsMajor: number;
  currency: string;
  occupancyRate?: number | null;
  averageDailyRateMajor?: number | null;
  unitsSold?: number | null;
  dataSource?: string | null;
  notes?: string | null;
}

function toMinor(n?: number | null): bigint | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return BigInt(Math.round(n * 100));
}

export async function createRevenueStreamAction(
  input: CreateRevenueStreamFormInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createRevenueStream({
      assetId: input.assetId,
      projectId: input.projectId,
      streamType: input.streamType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grossRevenueMinor: BigInt(Math.round((input.grossRevenueMajor || 0) * 100)),
      directCostsMinor: BigInt(Math.round((input.directCostsMajor || 0) * 100)),
      currency: input.currency || "IDR",
      occupancyRate: input.occupancyRate ?? undefined,
      averageDailyRateMinor: toMinor(input.averageDailyRateMajor),
      unitsSold: input.unitsSold ?? undefined,
      dataSource: input.dataSource ?? undefined,
      notes: input.notes ?? undefined,
    });
    revalidatePath("/development-os/revenue-streams");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to log revenue stream.",
    };
  }
}

export interface UpdateRevenueStreamFormInput {
  id: string;
  streamType: StreamType;
  periodStart: string;
  periodEnd: string;
  grossRevenueMajor: number;
  directCostsMajor: number;
  currency: string;
  occupancyRate?: number | null;
  averageDailyRateMajor?: number | null;
  unitsSold?: number | null;
  dataSource?: string | null;
  notes?: string | null;
}

export async function updateRevenueStreamAction(
  input: UpdateRevenueStreamFormInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await updateRevenueStream({
      id: input.id,
      streamType: input.streamType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grossRevenueMinor: BigInt(Math.round((input.grossRevenueMajor || 0) * 100)),
      directCostsMinor: BigInt(Math.round((input.directCostsMajor || 0) * 100)),
      currency: input.currency || "IDR",
      occupancyRate: input.occupancyRate ?? undefined,
      averageDailyRateMinor: toMinor(input.averageDailyRateMajor) ?? null,
      unitsSold: input.unitsSold ?? undefined,
      dataSource: input.dataSource ?? undefined,
      notes: input.notes ?? undefined,
    });
    revalidatePath("/development-os/revenue-streams");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update revenue stream.",
    };
  }
}

export async function deleteRevenueStreamAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteRevenueStream(id);
    revalidatePath("/development-os/revenue-streams");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete revenue stream.",
    };
  }
}
