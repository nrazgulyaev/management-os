import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  channelPushEvents,
  pricingChannelRules,
  pricingCloseOutRules,
  pricingDayOfWeekRules,
  pricingMinStayRules,
  pricingOccupancyRules,
  pricingQuoteLogs,
  pricingRuleSets,
  pricingStopSellRules,
  type ChannelPushEvent,
  type NewPricingQuoteLog,
  type PricingRuleSet,
} from "@/lib/db/schema/dynamic-pricing";
import { villas } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import {
  enumerateStayNights,
  isoDay,
  parseIsoDate,
  quoteStay,
  type QuoteStay,
} from "./quote-pure";
import { summarizeAvailabilityForRange } from "./availability-pure";
import type {
  ChannelRule,
  CloseOutRule,
  DayOfWeekRule,
  MinStayRule,
  OccupancyRule,
  RuleBundle,
  RuleSet,
  StopSellRule,
} from "./rule-types";

export async function listPricingRuleSets(opts?: {
  status?: "active" | "paused" | "archived";
  scope?: "global" | "project" | "villa";
}): Promise<PricingRuleSet[]> {
  const db = getDb();
  if (!db) return [];
  const filters: ReturnType<typeof eq>[] = [];
  if (opts?.status) filters.push(eq(pricingRuleSets.status, opts.status));
  if (opts?.scope) filters.push(eq(pricingRuleSets.scopeType, opts.scope));
  return db
    .select()
    .from(pricingRuleSets)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(pricingRuleSets.priority, pricingRuleSets.name);
}

export async function getPricingRuleSetById(
  id: string,
): Promise<PricingRuleSet | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(pricingRuleSets)
    .where(eq(pricingRuleSets.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Pick the most-specific active rule set for a villa.
 * Precedence: villa > project > global. Within a tier, lower
 * `priority` wins.
 */
export async function getApplicablePricingRuleSet(
  villaId: string,
): Promise<PricingRuleSet | null> {
  const db = getDb();
  if (!db) return null;
  const [villa] = await db
    .select({ id: villas.id, projectId: villas.projectId })
    .from(villas)
    .where(eq(villas.id, villaId))
    .limit(1);
  if (!villa) return null;

  const candidates = await db
    .select()
    .from(pricingRuleSets)
    .where(eq(pricingRuleSets.status, "active"))
    .orderBy(pricingRuleSets.priority);

  const villaScoped = candidates.filter(
    (c) => c.scopeType === "villa" && c.villaId === villa.id,
  );
  if (villaScoped[0]) return villaScoped[0];

  const projectScoped = candidates.filter(
    (c) => c.scopeType === "project" && c.projectId === villa.projectId,
  );
  if (projectScoped[0]) return projectScoped[0];

  const global = candidates.filter((c) => c.scopeType === "global");
  return global[0] ?? null;
}

export async function listPricingRulesForSet(ruleSetId: string): Promise<{
  dayOfWeek: typeof pricingDayOfWeekRules.$inferSelect[];
  occupancy: typeof pricingOccupancyRules.$inferSelect[];
  closeOut: typeof pricingCloseOutRules.$inferSelect[];
  channels: typeof pricingChannelRules.$inferSelect[];
  minStay: typeof pricingMinStayRules.$inferSelect[];
  stopSell: typeof pricingStopSellRules.$inferSelect[];
}> {
  const db = getDb();
  if (!db) {
    return {
      dayOfWeek: [],
      occupancy: [],
      closeOut: [],
      channels: [],
      minStay: [],
      stopSell: [],
    };
  }
  const [dow, occ, close, channels, minStay, stopSell] = await Promise.all([
    db
      .select()
      .from(pricingDayOfWeekRules)
      .where(eq(pricingDayOfWeekRules.ruleSetId, ruleSetId))
      .orderBy(pricingDayOfWeekRules.weekday),
    db
      .select()
      .from(pricingOccupancyRules)
      .where(eq(pricingOccupancyRules.ruleSetId, ruleSetId))
      .orderBy(pricingOccupancyRules.occupancyMin),
    db
      .select()
      .from(pricingCloseOutRules)
      .where(eq(pricingCloseOutRules.ruleSetId, ruleSetId))
      .orderBy(pricingCloseOutRules.daysBeforeCheckinMin),
    db
      .select()
      .from(pricingChannelRules)
      .where(eq(pricingChannelRules.ruleSetId, ruleSetId))
      .orderBy(pricingChannelRules.channelKey),
    db
      .select()
      .from(pricingMinStayRules)
      .where(eq(pricingMinStayRules.ruleSetId, ruleSetId))
      .orderBy(pricingMinStayRules.priority),
    db
      .select()
      .from(pricingStopSellRules)
      .where(eq(pricingStopSellRules.ruleSetId, ruleSetId))
      .orderBy(pricingStopSellRules.startsOn),
  ]);
  return {
    dayOfWeek: dow,
    occupancy: occ,
    closeOut: close,
    channels,
    minStay,
    stopSell,
  };
}

function mapRuleSet(r: PricingRuleSet): RuleSet {
  return {
    id: r.id,
    ruleSetCode: r.ruleSetCode,
    name: r.name,
    scopeType: r.scopeType as RuleSet["scopeType"],
    projectId: r.projectId,
    villaId: r.villaId,
    status: r.status as RuleSet["status"],
    priority: r.priority,
    currency: r.currency,
    baseRateMinor: r.baseRateMinor,
    minRateMinor: r.minRateMinor,
    maxRateMinor: r.maxRateMinor,
  };
}

async function loadBundle(
  ruleSet: PricingRuleSet,
): Promise<RuleBundle> {
  const lists = await listPricingRulesForSet(ruleSet.id);
  return {
    ruleSet: mapRuleSet(ruleSet),
    dayOfWeek: lists.dayOfWeek.map(
      (r): DayOfWeekRule => ({
        id: r.id,
        ruleSetId: r.ruleSetId,
        weekday: r.weekday,
        modifierType: r.modifierType as DayOfWeekRule["modifierType"],
        modifierValueNumeric:
          r.modifierValueNumeric != null ? Number(r.modifierValueNumeric) : null,
        modifierAmountMinor: r.modifierAmountMinor,
        minLos: r.minLos,
        status: r.status as DayOfWeekRule["status"],
      }),
    ),
    occupancy: lists.occupancy.map(
      (r): OccupancyRule => ({
        id: r.id,
        ruleSetId: r.ruleSetId,
        occupancyMin: Number(r.occupancyMin),
        occupancyMax: Number(r.occupancyMax),
        modifierType: r.modifierType as OccupancyRule["modifierType"],
        modifierValueNumeric:
          r.modifierValueNumeric != null ? Number(r.modifierValueNumeric) : null,
        modifierAmountMinor: r.modifierAmountMinor,
        status: r.status as OccupancyRule["status"],
      }),
    ),
    closeOut: lists.closeOut.map(
      (r): CloseOutRule => ({
        id: r.id,
        ruleSetId: r.ruleSetId,
        daysBeforeCheckinMin: r.daysBeforeCheckinMin,
        daysBeforeCheckinMax: r.daysBeforeCheckinMax,
        modifierType: r.modifierType as CloseOutRule["modifierType"],
        modifierValueNumeric:
          r.modifierValueNumeric != null ? Number(r.modifierValueNumeric) : null,
        modifierAmountMinor: r.modifierAmountMinor,
        minLos: r.minLos,
        status: r.status as CloseOutRule["status"],
      }),
    ),
    channels: lists.channels.map(
      (r): ChannelRule => ({
        id: r.id,
        ruleSetId: r.ruleSetId,
        channelKey: r.channelKey,
        modifierType: r.modifierType as ChannelRule["modifierType"],
        modifierValueNumeric:
          r.modifierValueNumeric != null ? Number(r.modifierValueNumeric) : null,
        modifierAmountMinor: r.modifierAmountMinor,
        commissionModel: r.commissionModel,
        status: r.status as ChannelRule["status"],
      }),
    ),
    minStay: lists.minStay.map(
      (r): MinStayRule => ({
        id: r.id,
        ruleSetId: r.ruleSetId,
        name: r.name,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        weekdayMask: r.weekdayMask,
        minLos: r.minLos,
        maxLos: r.maxLos,
        priority: r.priority,
        status: r.status as MinStayRule["status"],
      }),
    ),
    stopSell: lists.stopSell.map(
      (r): StopSellRule => ({
        id: r.id,
        ruleSetId: r.ruleSetId,
        name: r.name,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        reason: r.reason,
        channelKey: r.channelKey,
        status: r.status as StopSellRule["status"],
      }),
    ),
  };
}

export interface QuoteDynamicStayInput {
  villaId: string;
  checkIn: string;
  checkOut: string;
  channelKey?: string;
  publicQuote?: boolean;
}

export interface QuoteDynamicStayResult {
  stay: QuoteStay;
  ruleSet: PricingRuleSet | null;
}

export async function quoteDynamicStay(
  input: QuoteDynamicStayInput,
): Promise<QuoteDynamicStayResult> {
  const channelKey = input.channelKey ?? "direct";
  const ruleSet = await getApplicablePricingRuleSet(input.villaId);
  if (!ruleSet) {
    return {
      stay: emptyStay(input.checkIn, input.checkOut, "USD"),
      ruleSet: null,
    };
  }
  const bundle = await loadBundle(ruleSet);
  const today = isoDay(new Date());

  // Availability sources.
  const db = getDb();
  const [bookingRows, blockRows, ownerStayRows] = db
    ? await Promise.all([
        db
          .select({
            checkIn: bookings.checkIn,
            checkOut: bookings.checkOut,
            status: bookings.status,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.villaId, input.villaId),
              gte(bookings.checkOut, input.checkIn),
              lte(bookings.checkIn, input.checkOut),
            ),
          ),
        db
          .select({
            startsAt: villaCalendarBlocks.startsAt,
            endsAt: villaCalendarBlocks.endsAt,
            blockType: villaCalendarBlocks.blockType,
          })
          .from(villaCalendarBlocks)
          .where(
            and(
              eq(villaCalendarBlocks.villaId, input.villaId),
              eq(villaCalendarBlocks.status, "active"),
            ),
          ),
        db
          .select({
            requestedStart: ownerStayRequests.requestedStart,
            requestedEnd: ownerStayRequests.requestedEnd,
            status: ownerStayRequests.status,
          })
          .from(ownerStayRequests)
          .where(eq(ownerStayRequests.villaId, input.villaId)),
      ])
    : [[], [], []];

  const stopSellInputs = bundle.stopSell.map((s) => ({
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    channelKey: s.channelKey,
  }));

  const availability = summarizeAvailabilityForRange({
    startDate: input.checkIn,
    endDate: input.checkOut,
    bookings: bookingRows,
    blocks: blockRows,
    ownerStays: ownerStayRows,
    stopSells: stopSellInputs,
    channelKey,
  });

  const manualBlocksByDate: Record<string, { reason: string }> = {};
  for (const a of availability) {
    if (!a.available) {
      manualBlocksByDate[a.date] = { reason: a.reason };
    }
  }

  const stay = quoteStay({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    today,
    channelKey,
    bundle,
    manualBlocksByDate,
  });
  return { stay, ruleSet };
}

function emptyStay(
  checkIn: string,
  checkOut: string,
  currency: string,
): QuoteStay {
  return {
    available: false,
    reason: "no_nights",
    checkIn,
    checkOut,
    nights: 0,
    currency,
    totalMinor: 0n,
    averageNightlyMinor: 0n,
    requiredMinLos: null,
    minLosName: null,
    nightly: [],
    explanationSummary: "No applicable rule set.",
  };
}

export interface QuoteCalendarInput {
  villaId: string;
  startDate: string;
  days: number;
  channelKey?: string;
}

export interface QuoteCalendarCell {
  date: string;
  available: boolean;
  reason: string;
  finalRateMinor: bigint;
  currency: string;
}

export async function quoteDynamicCalendar(
  input: QuoteCalendarInput,
): Promise<{ ruleSet: PricingRuleSet | null; cells: QuoteCalendarCell[] }> {
  const ruleSet = await getApplicablePricingRuleSet(input.villaId);
  if (!ruleSet) return { ruleSet: null, cells: [] };
  const start = parseIsoDate(input.startDate);
  if (!start) return { ruleSet, cells: [] };
  const days = Math.max(1, Math.min(60, input.days));
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const cells: QuoteCalendarCell[] = [];
  const result = await quoteDynamicStay({
    villaId: input.villaId,
    checkIn: isoDay(start),
    checkOut: isoDay(end),
    channelKey: input.channelKey,
    publicQuote: false,
  });
  for (const n of result.stay.nightly) {
    cells.push({
      date: n.date,
      available: n.available,
      reason: n.unavailableReason ?? "available",
      finalRateMinor: n.finalRateMinor,
      currency: n.currency,
    });
  }
  // Pad missing nights when stay was rejected before per-night quoting.
  if (cells.length === 0) {
    const nights = enumerateStayNights(isoDay(start), isoDay(end));
    for (const date of nights) {
      cells.push({
        date,
        available: false,
        reason: result.stay.reason,
        finalRateMinor: 0n,
        currency: ruleSet.currency,
      });
    }
  }
  return { ruleSet, cells };
}

export async function listQuoteLogs(opts?: {
  villaId?: string;
  publicOnly?: boolean;
  limit?: number;
}): Promise<typeof pricingQuoteLogs.$inferSelect[]> {
  const db = getDb();
  if (!db) return [];
  const filters: ReturnType<typeof eq>[] = [];
  if (opts?.villaId) filters.push(eq(pricingQuoteLogs.villaId, opts.villaId));
  if (opts?.publicOnly) filters.push(eq(pricingQuoteLogs.publicQuote, true));
  return db
    .select()
    .from(pricingQuoteLogs)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(pricingQuoteLogs.createdAt))
    .limit(opts?.limit ?? 200);
}

export async function createQuoteLog(
  input: NewPricingQuoteLog,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .insert(pricingQuoteLogs)
    .values(input)
    .returning({ id: pricingQuoteLogs.id });
  return row?.id ?? null;
}

export async function listChannelPushEvents(opts?: {
  channelKey?: string;
  status?: ChannelPushEvent["status"];
  limit?: number;
}): Promise<ChannelPushEvent[]> {
  const db = getDb();
  if (!db) return [];
  const filters: ReturnType<typeof eq>[] = [];
  if (opts?.channelKey)
    filters.push(eq(channelPushEvents.channelKey, opts.channelKey));
  if (opts?.status) filters.push(eq(channelPushEvents.status, opts.status));
  return db
    .select()
    .from(channelPushEvents)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(channelPushEvents.createdAt))
    .limit(opts?.limit ?? 200);
}

export interface PricingHubMetrics {
  activeRuleSets: number;
  pausedRuleSets: number;
  publicQuotes24h: number;
  stopSellNights: number;
  simulatedPushes: number;
  villasMissingRuleSet: number;
}

export async function getPricingHubMetrics(): Promise<PricingHubMetrics> {
  const db = getDb();
  if (!db) {
    return {
      activeRuleSets: 0,
      pausedRuleSets: 0,
      publicQuotes24h: 0,
      stopSellNights: 0,
      simulatedPushes: 0,
      villasMissingRuleSet: 0,
    };
  }
  // Stage 9.I — was 6 parallel queries, three of which fetched ROW
  // SETS only to reduce them in JS:
  //   - pricingStopSellRules → JS sum of (endsOn - startsOn + 1) days
  //   - villas → JS Array.filter to find ones with no active rule-set
  //   - pricingRuleSets active → JS Array.some scoped lookup
  // All three reductions belong in SQL. Plus the four COUNT queries
  // collapse via FILTER. Net result: 3 round-trips instead of 6, and
  // every reduction runs against the storage engine instead of pulling
  // rows over the wire.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const [[ruleSetCounts], [pricingActivity], [villaCounts]] = await Promise.all([
    // 1. pricing_rule_sets aggregate.
    db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${pricingRuleSets.status} = 'active')::int`,
        paused: sql<number>`COUNT(*) FILTER (WHERE ${pricingRuleSets.status} = 'paused')::int`,
      })
      .from(pricingRuleSets),

    // 2. pricing_quote_logs + channel_push_events + stop-sell sum in
    // a single round-trip via three FILTER aggregates over a CROSS
    // JOIN of three independent counts. Each subquery hits exactly
    // one table. No JS reduce.
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM ${pricingQuoteLogs}
         WHERE ${pricingQuoteLogs.publicQuote} = true
           AND ${pricingQuoteLogs.createdAt} >= ${sinceIso}::timestamptz
        ) AS public_quotes_24h,
        (SELECT COUNT(*)::int FROM ${channelPushEvents}
         WHERE ${channelPushEvents.status} = 'simulated'
        ) AS simulated_pushes,
        COALESCE((
          SELECT SUM(
            GREATEST(
              0,
              (${pricingStopSellRules.endsOn} - ${pricingStopSellRules.startsOn})::int + 1
            )
          )::int
          FROM ${pricingStopSellRules}
          WHERE ${pricingStopSellRules.status} = 'active'
        ), 0) AS stop_sell_nights
    `),

    // 3. villas-missing-rule-set: NOT EXISTS for an active rule-set
    // covering each villa (global scope OR matching villa scope).
    db.execute(sql`
      SELECT COUNT(*)::int AS missing
        FROM ${villas} v
       WHERE NOT EXISTS (
         SELECT 1 FROM ${pricingRuleSets} rs
          WHERE rs.status = 'active'
            AND (rs.scope_type = 'global' OR (rs.scope_type = 'villa' AND rs.villa_id = v.id))
       )
    `),
  ]);

  const pricingRow = rowsOf<{
    public_quotes_24h?: number;
    simulated_pushes?: number;
    stop_sell_nights?: number;
  }>(pricingActivity)[0];
  const villaRow = rowsOf<{ missing?: number }>(villaCounts)[0];

  return {
    activeRuleSets: ruleSetCounts?.active ?? 0,
    pausedRuleSets: ruleSetCounts?.paused ?? 0,
    publicQuotes24h: Number(pricingRow?.public_quotes_24h ?? 0),
    stopSellNights: Number(pricingRow?.stop_sell_nights ?? 0),
    simulatedPushes: Number(pricingRow?.simulated_pushes ?? 0),
    villasMissingRuleSet: Number(villaRow?.missing ?? 0),
  };
}
