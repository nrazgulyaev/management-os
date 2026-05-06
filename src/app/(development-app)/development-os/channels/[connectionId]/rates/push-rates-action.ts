"use server";

import { eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  channelConnections,
  channelSyncLog,
  type ChannelName,
} from "@/lib/db/schema/channel-manager";
import { decryptConnectionCredentials } from "@/lib/channel-manager/actions";
import { selectChannelProvider } from "@/lib/channel-manager/select-provider";
import type { RatesInput } from "@/lib/channel-manager/types";

/**
 * Stage 6.P1.E.3 — Server action backing the rate calendar's
 * "Push to {channel}" button.
 *
 * Reads the operator's overrides map from the FormData blob (sent as
 * a JSON string from the client component), reconstructs a RatesInput,
 * dispatches via the channel provider, and logs to channel_sync_log.
 *
 * P1.G's cron jobs use the same provider.pushRates path; this manual
 * trigger exists so operators can push immediately after editing
 * without waiting for the next scheduled run.
 */

export interface PushRatesResult {
  ok: boolean;
  recordsProcessed?: number;
  apiCallsCount?: number;
  error?: string;
}

export async function pushRatesForConnection(
  formData: FormData,
): Promise<PushRatesResult> {
  await requireInternalUser();
  const connectionId = String(formData.get("connectionId") ?? "");
  const overridesRaw = String(formData.get("overrides") ?? "[]");
  if (!connectionId) {
    return { ok: false, error: "connectionId required" };
  }

  let overridesEntries: Array<[string, { amount: number; currency: string; minStay?: number }]>;
  try {
    overridesEntries = JSON.parse(overridesRaw);
    if (!Array.isArray(overridesEntries)) throw new Error("not an array");
  } catch {
    return { ok: false, error: "overrides must be a JSON array of [date, rate] tuples" };
  }
  if (overridesEntries.length === 0) {
    return { ok: false, error: "no rates to push" };
  }

  const db = requireDb();
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!row) {
    return { ok: false, error: "connection not found" };
  }

  const creds = await decryptConnectionCredentials(connectionId);
  const provider = selectChannelProvider(row.channel as ChannelName, creds);

  const ratesPerDay = new Map<
    string,
    { amountMinor: bigint; currency: string; minStay?: number }
  >();
  for (const [date, rate] of overridesEntries) {
    if (!date || !rate?.currency || typeof rate.amount !== "number") continue;
    ratesPerDay.set(date, {
      amountMinor: BigInt(Math.round(rate.amount * 100)),
      currency: rate.currency,
      minStay: rate.minStay,
    });
  }
  if (ratesPerDay.size === 0) {
    return { ok: false, error: "no valid rates after parsing" };
  }
  const sorted = [...ratesPerDay.keys()].sort();
  const ratesInput: RatesInput = {
    villaId: row.villaId,
    externalPropertyId: row.externalPropertyId,
    ratePlanId: row.externalPropertyId,
    startDate: new Date(sorted[0]),
    endDate: new Date(sorted[sorted.length - 1]),
    ratesPerDay,
  };

  const startedAt = new Date();
  const result = await provider.pushRates(ratesInput);

  await db.insert(channelSyncLog).values({
    organizationId: row.organizationId,
    channelConnectionId: connectionId,
    syncType: "rates_push",
    triggerSource: "manual",
    recordsProcessed: result.recordsProcessed,
    recordsSucceeded: result.recordsSucceeded,
    recordsFailed: result.recordsFailed,
    status: result.success ? "success" : "failed",
    errorMessage: result.success ? null : result.errors[0]?.message ?? null,
    durationMs: result.durationMs,
    triggeredAt: startedAt,
    completedAt: new Date(),
    apiCallsCount: result.apiCallsCount,
  });

  return {
    ok: result.success,
    recordsProcessed: result.recordsProcessed,
    apiCallsCount: result.apiCallsCount,
    error: result.success ? undefined : result.errors[0]?.message,
  };
}
