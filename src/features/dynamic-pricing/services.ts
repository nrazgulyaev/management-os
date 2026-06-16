import "server-only";

import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
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
  villaRateOverrides,
  type ChannelPushEvent,
  type NewPricingQuoteLog,
  type PricingRuleSet,
} from "@/lib/db/schema/dynamic-pricing";
import { projects, villas } from "@/lib/db/schema/projects";
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
  // TENANCY (0153): pricing_rule_sets carries organization_id. Scope every
  // list read to the caller's org so the rule-sets / channel-push pages never
  // surface another tenant's rule sets.
  const organizationId = await requireOrgId();
  const filters: ReturnType<typeof eq>[] = [
    eq(pricingRuleSets.organizationId, organizationId),
  ];
  if (opts?.status) filters.push(eq(pricingRuleSets.status, opts.status));
  if (opts?.scope) filters.push(eq(pricingRuleSets.scopeType, opts.scope));
  return db
    .select()
    .from(pricingRuleSets)
    .where(and(...filters))
    .orderBy(pricingRuleSets.priority, pricingRuleSets.name);
}

export async function getPricingRuleSetById(
  id: string,
): Promise<PricingRuleSet | null> {
  const db = getDb();
  if (!db) return null;
  // Org-scoped detail loader: a cross-org id resolves to null (→ notFound()).
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(pricingRuleSets)
    .where(
      and(
        eq(pricingRuleSets.id, id),
        eq(pricingRuleSets.organizationId, organizationId),
      ),
    )
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
  organizationId?: string,
): Promise<PricingRuleSet | null> {
  const db = getDb();
  if (!db) return null;
  // When an org is supplied (dashboard / operator entrypoints), resolve the
  // villa THROUGH its project and require the project to belong to that org —
  // villas carry no org column, so the parent project is the tenancy anchor.
  // A cross-org villaId then yields no villa → no rule set. The public quote
  // path (no org arg) stays org-agnostic by design (prices only, no PII).
  const [villa] = organizationId
    ? await db
        .select({ id: villas.id, projectId: villas.projectId })
        .from(villas)
        .innerJoin(projects, eq(projects.id, villas.projectId))
        .where(
          and(
            eq(villas.id, villaId),
            eq(projects.organizationId, organizationId),
          ),
        )
        .limit(1)
    : await db
        .select({ id: villas.id, projectId: villas.projectId })
        .from(villas)
        .where(eq(villas.id, villaId))
        .limit(1);
  if (!villa) return null;

  const candidates = await db
    .select()
    .from(pricingRuleSets)
    .where(
      organizationId
        ? and(
            eq(pricingRuleSets.status, "active"),
            eq(pricingRuleSets.organizationId, organizationId),
          )
        : eq(pricingRuleSets.status, "active"),
    )
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

export async function listPricingRulesForSet(
  ruleSetId: string,
  organizationId?: string,
): Promise<{
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
  // Each rule family carries organization_id (0153). When an org is supplied
  // (page entrypoints with a client ruleSetId) AND it into every sub-query so
  // a foreign rule set's rules never leak. When omitted (loadBundle, reached
  // from the org-agnostic public quote with an already-resolved rule set) the
  // ruleSetId filter alone suffices.
  const [dow, occ, close, channels, minStay, stopSell] = await Promise.all([
    db
      .select()
      .from(pricingDayOfWeekRules)
      .where(
        and(
          eq(pricingDayOfWeekRules.ruleSetId, ruleSetId),
          organizationId
            ? eq(pricingDayOfWeekRules.organizationId, organizationId)
            : undefined,
        ),
      )
      .orderBy(pricingDayOfWeekRules.weekday),
    db
      .select()
      .from(pricingOccupancyRules)
      .where(
        and(
          eq(pricingOccupancyRules.ruleSetId, ruleSetId),
          organizationId
            ? eq(pricingOccupancyRules.organizationId, organizationId)
            : undefined,
        ),
      )
      .orderBy(pricingOccupancyRules.occupancyMin),
    db
      .select()
      .from(pricingCloseOutRules)
      .where(
        and(
          eq(pricingCloseOutRules.ruleSetId, ruleSetId),
          organizationId
            ? eq(pricingCloseOutRules.organizationId, organizationId)
            : undefined,
        ),
      )
      .orderBy(pricingCloseOutRules.daysBeforeCheckinMin),
    db
      .select()
      .from(pricingChannelRules)
      .where(
        and(
          eq(pricingChannelRules.ruleSetId, ruleSetId),
          organizationId
            ? eq(pricingChannelRules.organizationId, organizationId)
            : undefined,
        ),
      )
      .orderBy(pricingChannelRules.channelKey),
    db
      .select()
      .from(pricingMinStayRules)
      .where(
        and(
          eq(pricingMinStayRules.ruleSetId, ruleSetId),
          organizationId
            ? eq(pricingMinStayRules.organizationId, organizationId)
            : undefined,
        ),
      )
      .orderBy(pricingMinStayRules.priority),
    db
      .select()
      .from(pricingStopSellRules)
      .where(
        and(
          eq(pricingStopSellRules.ruleSetId, ruleSetId),
          organizationId
            ? eq(pricingStopSellRules.organizationId, organizationId)
            : undefined,
        ),
      )
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

// =============================================================================
// MANUAL RATE OVERRIDES (per villa + night)
// =============================================================================

export interface VillaRateOverrideRow {
  id: string;
  stayDate: string;
  nightlyRateMinor: bigint;
  currency: string;
  note: string | null;
}

/**
 * Map of stayDate (YYYY-MM-DD) → override nightly rate (minor) for the
 * half-open range [startIso, endIso). Fed into quoteStay so an override wins
 * over every rule modifier.
 */
export async function getVillaRateOverridesByDate(
  villaId: string,
  startIso: string,
  endIso: string,
  organizationId?: string,
): Promise<Record<string, bigint>> {
  const db = getDb();
  if (!db) return {};
  const rows = await db
    .select({
      stayDate: villaRateOverrides.stayDate,
      nightlyRateMinor: villaRateOverrides.nightlyRateMinor,
    })
    .from(villaRateOverrides)
    .where(
      and(
        eq(villaRateOverrides.villaId, villaId),
        gte(villaRateOverrides.stayDate, startIso),
        lt(villaRateOverrides.stayDate, endIso),
        // villa_rate_overrides carries organization_id (0153). When an org is
        // supplied (dashboard / operator entrypoints) AND it in so a cross-org
        // villaId yields no overrides. The public quote path passes no org.
        organizationId
          ? eq(villaRateOverrides.organizationId, organizationId)
          : undefined,
      ),
    );
  const out: Record<string, bigint> = {};
  for (const r of rows) out[r.stayDate] = BigInt(r.nightlyRateMinor);
  return out;
}

/** List-view of overrides for a villa within [startIso, endIso). */
export async function listVillaRateOverrides(
  villaId: string,
  startIso: string,
  endIso: string,
): Promise<VillaRateOverrideRow[]> {
  const db = getDb();
  if (!db) return [];
  // Dashboard-only list view — hard-scope to the caller's org (no public /
  // cron caller exists).
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(villaRateOverrides)
    .where(
      and(
        eq(villaRateOverrides.villaId, villaId),
        eq(villaRateOverrides.organizationId, organizationId),
        gte(villaRateOverrides.stayDate, startIso),
        lt(villaRateOverrides.stayDate, endIso),
      ),
    )
    .orderBy(villaRateOverrides.stayDate);
  return rows.map((r) => ({
    id: r.id,
    stayDate: r.stayDate,
    nightlyRateMinor: BigInt(r.nightlyRateMinor),
    currency: r.currency,
    note: r.note,
  }));
}

export interface QuoteDynamicStayInput {
  villaId: string;
  checkIn: string;
  checkOut: string;
  channelKey?: string;
  publicQuote?: boolean;
  /**
   * When set (dashboard / operator callers), the villa must resolve in this
   * org or the quote returns the empty stay — closes the raw `?villa=` IDOR on
   * the pricing pages. When omitted (public /api/v1/quote), the quote stays
   * org-agnostic by design (prices only, no PII).
   */
  organizationId?: string;
}

export interface QuoteDynamicStayResult {
  stay: QuoteStay;
  ruleSet: PricingRuleSet | null;
  /** stayDate → override nightly rate (minor) applied to this quote. */
  overridesByDate: Record<string, bigint>;
}

export async function quoteDynamicStay(
  input: QuoteDynamicStayInput,
): Promise<QuoteDynamicStayResult> {
  const channelKey = input.channelKey ?? "direct";
  const ruleSet = await getApplicablePricingRuleSet(
    input.villaId,
    input.organizationId,
  );
  if (!ruleSet) {
    return {
      stay: emptyStay(input.checkIn, input.checkOut, "USD"),
      ruleSet: null,
      overridesByDate: {},
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

  const manualOverridesByDate = await getVillaRateOverridesByDate(
    input.villaId,
    input.checkIn,
    input.checkOut,
    input.organizationId,
  );

  const stay = quoteStay({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    today,
    channelKey,
    bundle,
    manualBlocksByDate,
    manualOverridesByDate,
  });
  return { stay, ruleSet, overridesByDate: manualOverridesByDate };
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
  /** See QuoteDynamicStayInput.organizationId — dashboard callers pass it. */
  organizationId?: string;
}

export interface QuoteCalendarCell {
  date: string;
  available: boolean;
  reason: string;
  finalRateMinor: bigint;
  currency: string;
  /** Manual override applied to this night (minor), else null. */
  overrideMinor: bigint | null;
}

export async function quoteDynamicCalendar(
  input: QuoteCalendarInput,
): Promise<{ ruleSet: PricingRuleSet | null; cells: QuoteCalendarCell[] }> {
  const ruleSet = await getApplicablePricingRuleSet(
    input.villaId,
    input.organizationId,
  );
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
    organizationId: input.organizationId,
  });
  for (const n of result.stay.nightly) {
    cells.push({
      date: n.date,
      available: n.available,
      reason: n.unavailableReason ?? "available",
      finalRateMinor: n.finalRateMinor,
      currency: n.currency,
      overrideMinor: result.overridesByDate[n.date] ?? null,
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
        overrideMinor: null,
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
  // pricing_quote_logs carries organization_id (0153). Scope the logs page to
  // the caller's org so quote observability never spans tenants.
  const organizationId = await requireOrgId();
  const filters: ReturnType<typeof eq>[] = [
    eq(pricingQuoteLogs.organizationId, organizationId),
  ];
  if (opts?.villaId) filters.push(eq(pricingQuoteLogs.villaId, opts.villaId));
  if (opts?.publicOnly) filters.push(eq(pricingQuoteLogs.publicQuote, true));
  return db
    .select()
    .from(pricingQuoteLogs)
    .where(and(...filters))
    .orderBy(desc(pricingQuoteLogs.createdAt))
    .limit(opts?.limit ?? 200);
}

export async function createQuoteLog(
  input: NewPricingQuoteLog,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY (0153): pricing_quote_logs.organization_id was previously left
  // NULL on insert (reached from the public /api/v1/quote + direct-booking
  // flows, none of which pass an org). Stamp it by resolving the villa's org
  // through projects.organization_id so every quote log is tenant-attributable
  // and the org-scoped logs reader can see it.
  let organizationId = input.organizationId ?? null;
  if (!organizationId && input.villaId) {
    const [owner] = await db
      .select({ organizationId: projects.organizationId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, input.villaId))
      .limit(1);
    organizationId = owner?.organizationId ?? null;
  }
  const [row] = await db
    .insert(pricingQuoteLogs)
    .values({ ...input, organizationId })
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
  // channel_push_events carries organization_id (0153). Scope the channel-push
  // page to the caller's org so events never span tenants.
  const organizationId = await requireOrgId();
  const filters: ReturnType<typeof eq>[] = [
    eq(channelPushEvents.organizationId, organizationId),
  ];
  if (opts?.channelKey)
    filters.push(eq(channelPushEvents.channelKey, opts.channelKey));
  if (opts?.status) filters.push(eq(channelPushEvents.status, opts.status));
  return db
    .select()
    .from(channelPushEvents)
    .where(and(...filters))
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
  // Hub metrics must reflect ONLY the caller's tenant — every count /
  // aggregate gets a WHERE organization_id = <org>, and the villas
  // NOT-EXISTS scopes through projects.organization_id.
  const organizationId = await requireOrgId();

  const [[ruleSetCounts], [pricingActivity], [villaCounts]] = await Promise.all([
    // 1. pricing_rule_sets aggregate.
    db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${pricingRuleSets.status} = 'active')::int`,
        paused: sql<number>`COUNT(*) FILTER (WHERE ${pricingRuleSets.status} = 'paused')::int`,
      })
      .from(pricingRuleSets)
      .where(eq(pricingRuleSets.organizationId, organizationId)),

    // 2. pricing_quote_logs + channel_push_events + stop-sell sum in
    // a single round-trip via three FILTER aggregates over a CROSS
    // JOIN of three independent counts. Each subquery hits exactly
    // one table. No JS reduce.
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM ${pricingQuoteLogs}
         WHERE ${pricingQuoteLogs.publicQuote} = true
           AND ${pricingQuoteLogs.createdAt} >= ${sinceIso}::timestamptz
           AND ${pricingQuoteLogs.organizationId} = ${organizationId}::uuid
        ) AS public_quotes_24h,
        (SELECT COUNT(*)::int FROM ${channelPushEvents}
         WHERE ${channelPushEvents.status} = 'simulated'
           AND ${channelPushEvents.organizationId} = ${organizationId}::uuid
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
            AND ${pricingStopSellRules.organizationId} = ${organizationId}::uuid
        ), 0) AS stop_sell_nights
    `),

    // 3. villas-missing-rule-set: NOT EXISTS for an active rule-set
    // covering each villa (global scope OR matching villa scope). Scope
    // the villas to the caller's org through projects.organization_id,
    // and the rule-set subquery to the same org.
    db.execute(sql`
      SELECT COUNT(*)::int AS missing
        FROM ${villas} v
        JOIN ${projects} p ON p.id = v.project_id
       WHERE p.organization_id = ${organizationId}::uuid
         AND NOT EXISTS (
         SELECT 1 FROM ${pricingRuleSets} rs
          WHERE rs.status = 'active'
            AND rs.organization_id = ${organizationId}::uuid
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

// =============================================================================
// RULE COUNTS — per-rule-set meta for the rule-sets list
// =============================================================================

export interface RuleSetRuleCounts {
  total: number;
  active: number;
}

/**
 * Per-rule-set rule counts across all six rule families. One grouped
 * COUNT query per family (6 round-trips total, independent of how many
 * rule sets exist) so the list page can show honest "N rules · M active"
 * meta without loading every rule row.
 */
export async function countPricingRulesPerSet(): Promise<
  Map<string, RuleSetRuleCounts>
> {
  const out = new Map<string, RuleSetRuleCounts>();
  const db = getDb();
  if (!db) return out;
  // Each rule family carries organization_id (0153). Scope every grouped
  // count to the caller's org so the rule-sets list never tallies a foreign
  // tenant's rules.
  const organizationId = await requireOrgId();
  const grouped = await Promise.all([
    db
      .select({
        ruleSetId: pricingDayOfWeekRules.ruleSetId,
        status: pricingDayOfWeekRules.status,
        n: sql<number>`count(*)::int`,
      })
      .from(pricingDayOfWeekRules)
      .where(eq(pricingDayOfWeekRules.organizationId, organizationId))
      .groupBy(pricingDayOfWeekRules.ruleSetId, pricingDayOfWeekRules.status),
    db
      .select({
        ruleSetId: pricingOccupancyRules.ruleSetId,
        status: pricingOccupancyRules.status,
        n: sql<number>`count(*)::int`,
      })
      .from(pricingOccupancyRules)
      .where(eq(pricingOccupancyRules.organizationId, organizationId))
      .groupBy(pricingOccupancyRules.ruleSetId, pricingOccupancyRules.status),
    db
      .select({
        ruleSetId: pricingCloseOutRules.ruleSetId,
        status: pricingCloseOutRules.status,
        n: sql<number>`count(*)::int`,
      })
      .from(pricingCloseOutRules)
      .where(eq(pricingCloseOutRules.organizationId, organizationId))
      .groupBy(pricingCloseOutRules.ruleSetId, pricingCloseOutRules.status),
    db
      .select({
        ruleSetId: pricingChannelRules.ruleSetId,
        status: pricingChannelRules.status,
        n: sql<number>`count(*)::int`,
      })
      .from(pricingChannelRules)
      .where(eq(pricingChannelRules.organizationId, organizationId))
      .groupBy(pricingChannelRules.ruleSetId, pricingChannelRules.status),
    db
      .select({
        ruleSetId: pricingMinStayRules.ruleSetId,
        status: pricingMinStayRules.status,
        n: sql<number>`count(*)::int`,
      })
      .from(pricingMinStayRules)
      .where(eq(pricingMinStayRules.organizationId, organizationId))
      .groupBy(pricingMinStayRules.ruleSetId, pricingMinStayRules.status),
    db
      .select({
        ruleSetId: pricingStopSellRules.ruleSetId,
        status: pricingStopSellRules.status,
        n: sql<number>`count(*)::int`,
      })
      .from(pricingStopSellRules)
      .where(eq(pricingStopSellRules.organizationId, organizationId))
      .groupBy(pricingStopSellRules.ruleSetId, pricingStopSellRules.status),
  ]);
  for (const rows of grouped) {
    for (const r of rows) {
      const cur = out.get(r.ruleSetId) ?? { total: 0, active: 0 };
      cur.total += r.n;
      if (r.status === "active") cur.active += r.n;
      out.set(r.ruleSetId, cur);
    }
  }
  return out;
}
