import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  channelPushEvents,
  pricingRuleSets,
  type NewChannelPushEvent,
} from "@/lib/db/schema/dynamic-pricing";
import { quoteDynamicCalendar } from "./services";

/**
 * Outbound channel-manager STUB — does not call any real API.
 * Records the would-be payload as a `simulated` event so admins can
 * review what the platform would push when integration ships.
 */
export async function simulateChannelPushForRatePlan(args: {
  ruleSetId: string;
  dateStart: string;
  dateEnd: string;
  channelKey: string;
  eventType:
    | "rate_update"
    | "availability_update"
    | "stop_sell_update"
    | "min_stay_update";
  createdBy: string | null;
  /** Caller's org (server-derived). The rule set must belong to it. */
  organizationId: string;
}): Promise<{ id: string | null; eventCode: string }> {
  const db = getDb();
  if (!db) return { id: null, eventCode: "" };
  // Resolve org ONCE: the rule set must belong to the caller's org. A cross-org
  // ruleSetId resolves to nothing → no read of another tenant's rule set and no
  // event written. The channel_push_events insert is then stamped with this org.
  const [ruleSet] = await db
    .select()
    .from(pricingRuleSets)
    .where(
      and(
        eq(pricingRuleSets.id, args.ruleSetId),
        eq(pricingRuleSets.organizationId, args.organizationId),
      ),
    )
    .limit(1);
  if (!ruleSet) return { id: null, eventCode: "" };
  // Build a representative payload using the dynamic calendar for the
  // first villa we can find on the rule set scope. For global / project
  // scopes the payload is keyed by ruleSet only.
  const targetVillaId = ruleSet.villaId ?? null;
  const payload: Record<string, unknown> = {
    ruleSetId: ruleSet.id,
    ruleSetName: ruleSet.name,
    scope: ruleSet.scopeType,
    channelKey: args.channelKey,
    eventType: args.eventType,
    dateStart: args.dateStart,
    dateEnd: args.dateEnd,
  };
  if (targetVillaId) {
    const cal = await quoteDynamicCalendar({
      villaId: targetVillaId,
      startDate: args.dateStart,
      days: Math.min(
        60,
        Math.max(
          1,
          Math.round(
            (Date.parse(args.dateEnd) - Date.parse(args.dateStart)) /
              (24 * 60 * 60 * 1000),
          ) || 1,
        ),
      ),
      channelKey: args.channelKey,
      organizationId: args.organizationId,
    });
    payload.cells = cal.cells.map((c) => ({
      date: c.date,
      available: c.available,
      reason: c.reason,
      rateMinor: c.finalRateMinor.toString(),
      currency: c.currency,
    }));
  }
  const eventCode = `CPE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const insert: NewChannelPushEvent = {
    organizationId: args.organizationId,
    eventCode,
    eventType: args.eventType,
    channelKey: args.channelKey,
    villaId: targetVillaId,
    projectId: ruleSet.projectId,
    dateStart: args.dateStart,
    dateEnd: args.dateEnd,
    payloadJson: payload,
    status: "simulated",
    createdBy: args.createdBy,
  };
  const [row] = await db
    .insert(channelPushEvents)
    .values(insert)
    .returning({ id: channelPushEvents.id });
  return { id: row?.id ?? null, eventCode };
}
