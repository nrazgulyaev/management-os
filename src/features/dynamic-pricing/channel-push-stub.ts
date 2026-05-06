import "server-only";

import { eq } from "drizzle-orm";
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
}): Promise<{ id: string | null; eventCode: string }> {
  const db = getDb();
  if (!db) return { id: null, eventCode: "" };
  const [ruleSet] = await db
    .select()
    .from(pricingRuleSets)
    .where(eq(pricingRuleSets.id, args.ruleSetId))
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
