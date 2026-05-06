/**
 * Prompt 110 — Pure grouping helpers for owner statements.
 *
 * Inputs are statement_lines (already owner-scoped via the existing
 * services layer) plus an optional `context` map that carries the
 * known revenue source / channel info for each line.  Outputs are
 * deterministic owner-safe groups + per-line bridge rows.
 *
 * No DB / no `server-only` import.
 */

// -----------------------------------------------------------------------------
// Group taxonomy
// -----------------------------------------------------------------------------

export type StatementGroupKey =
  | "direct_booking_revenue"
  | "ota_revenue"
  | "guest_service_revenue"
  | "owner_stay_charges"
  | "maintenance_charges"
  | "utility_charges"
  | "inventory_charges"
  | "service_fulfilment_costs"
  | "management_fees"
  | "taxes"
  | "reserves"
  | "payouts"
  | "adjustments"
  | "other";

export const STATEMENT_GROUP_KEYS: ReadonlyArray<StatementGroupKey> = [
  "direct_booking_revenue",
  "ota_revenue",
  "guest_service_revenue",
  "owner_stay_charges",
  "maintenance_charges",
  "utility_charges",
  "inventory_charges",
  "service_fulfilment_costs",
  "management_fees",
  "taxes",
  "reserves",
  "payouts",
  "adjustments",
  "other",
];

const GROUP_DEFINITIONS: Record<
  StatementGroupKey,
  {
    label: string;
    description: string;
    sortOrder: number;
    /** Most groups are owner-visible.  `payouts` is excluded by default
     *  because the net payout already appears in the statement header. */
    ownerVisible: boolean;
  }
> = {
  direct_booking_revenue: {
    label: "Direct booking revenue",
    description:
      "Revenue from bookings made directly through Arconique. No OTA commission, but may still include payment, admin, or management fees recorded separately.",
    sortOrder: 10,
    ownerVisible: true,
  },
  ota_revenue: {
    label: "OTA / platform revenue",
    description:
      "Revenue from third-party platform bookings (Airbnb, Booking.com, Vrbo, etc.). Platform commissions, where charged, appear under taxes / fees.",
    sortOrder: 20,
    ownerVisible: true,
  },
  guest_service_revenue: {
    label: "Guest services & upsells",
    description:
      "Concierge service orders and in-stay upsells fulfilled during the period.",
    sortOrder: 30,
    ownerVisible: true,
  },
  owner_stay_charges: {
    label: "Owner stay charges",
    description:
      "Operational charges and management compensation associated with owner stays.",
    sortOrder: 40,
    ownerVisible: true,
  },
  maintenance_charges: {
    label: "Maintenance",
    description:
      "Repairs, preventive work, and maintenance materials recorded against the villa.",
    sortOrder: 50,
    ownerVisible: true,
  },
  utility_charges: {
    label: "Utilities",
    description:
      "Electricity, water, internet, and other utility-driven operating costs.",
    sortOrder: 60,
    ownerVisible: true,
  },
  inventory_charges: {
    label: "Inventory & supplies",
    description:
      "Consumable supplies and inventory used during the period.",
    sortOrder: 70,
    ownerVisible: true,
  },
  service_fulfilment_costs: {
    label: "Service fulfilment costs",
    description:
      "Vendor / fulfilment costs associated with concierge services delivered to guests.",
    sortOrder: 80,
    ownerVisible: true,
  },
  management_fees: {
    label: "Management fees",
    description:
      "Management fees billed for the period under your management model.",
    sortOrder: 90,
    ownerVisible: true,
  },
  taxes: {
    label: "Taxes & platform fees",
    description:
      "Statutory taxes, channel commissions, and platform-related fees.",
    sortOrder: 100,
    ownerVisible: true,
  },
  reserves: {
    label: "Reserve movements",
    description:
      "Funds added to or released from your reserve balance during the period.",
    sortOrder: 110,
    ownerVisible: true,
  },
  payouts: {
    label: "Payouts",
    description: "Owner payouts already issued for the period.",
    sortOrder: 120,
    ownerVisible: false,
  },
  adjustments: {
    label: "Adjustments",
    description: "Manual adjustments and corrections.",
    sortOrder: 130,
    ownerVisible: true,
  },
  other: {
    label: "Other",
    description: "Lines that did not match any other category.",
    sortOrder: 140,
    ownerVisible: true,
  },
};

export function groupKeyToOwnerLabel(key: StatementGroupKey): string {
  return GROUP_DEFINITIONS[key].label;
}

export function groupKeyToDescription(key: StatementGroupKey): string {
  return GROUP_DEFINITIONS[key].description;
}

export function groupKeySortOrder(key: StatementGroupKey): number {
  return GROUP_DEFINITIONS[key].sortOrder;
}

export function isOwnerVisibleGroup(key: StatementGroupKey): boolean {
  return GROUP_DEFINITIONS[key].ownerVisible;
}

// -----------------------------------------------------------------------------
// Statement-line input shape (subset of StatementLineRow)
// -----------------------------------------------------------------------------

export interface StatementLineInput {
  id: string;
  lineType:
    | "revenue"
    | "fee"
    | "expense"
    | "tax"
    | "reserve"
    | "management_fee"
    | "payout"
    | "adjustment";
  category: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  ownerVisible: boolean;
  sortOrder: number;
  sourceTable: string | null;
  sourceId: string | null;
}

/**
 * Optional context hints sourced from upstream tables (revenue_lines,
 * direct_booking_finance_links, owner_stay_finance_links, etc.).
 *
 * The keys are revenue_line_id / expense_line_id (whichever is the
 * underlying source row for the statement_line).  When a hint is
 * available the classifier prefers it over the description heuristic.
 */
export interface ClassificationContext {
  /** Map source_id → upstream revenue_lines.source string. */
  revenueSource?: Record<string, string | null>;
  /** Map source_id → upstream revenue_lines.revenue_type string. */
  revenueType?: Record<string, string | null>;
  /** Map source_id → channel key (e.g. "airbnb", "direct"). */
  channelKey?: Record<string, string | null>;
  /** Map source_id → upstream expense_lines.expense_type string. */
  expenseType?: Record<string, string | null>;
  /** Set of source_ids that have an active direct-booking finance link. */
  directBookingSourceIds?: Set<string>;
  /** Set of source_ids that have an active owner-stay finance link. */
  ownerStaySourceIds?: Set<string>;
  /** Set of source_ids that have an active guest-service finance link. */
  guestServiceSourceIds?: Set<string>;
  /** Set of source_ids that have an active service-fulfilment finance link. */
  serviceFulfilmentSourceIds?: Set<string>;
}

// -----------------------------------------------------------------------------
// Predicates
// -----------------------------------------------------------------------------

const OTA_CHANNEL_KEYS = new Set([
  "airbnb",
  "booking_com",
  "booking.com",
  "bookingcom",
  "vrbo",
  "homeaway",
  "agoda",
  "expedia",
]);

function lookup<T>(
  map: Record<string, T> | undefined,
  key: string | null,
): T | null {
  if (!map || !key) return null;
  return key in map ? map[key] : null;
}

function descContains(line: StatementLineInput, ...needles: string[]): boolean {
  const desc = (line.description ?? "").toLowerCase();
  const cat = (line.category ?? "").toLowerCase();
  for (const n of needles) {
    if (desc.includes(n) || cat.includes(n)) return true;
  }
  return false;
}

export function statementLineBelongsToDirectBooking(
  line: StatementLineInput,
  ctx: ClassificationContext,
): boolean {
  if (line.lineType !== "revenue") return false;
  if (line.sourceId && ctx.directBookingSourceIds?.has(line.sourceId)) return true;
  const rt = lookup(ctx.revenueType, line.sourceId);
  if (rt && rt.includes("direct_booking")) return true;
  const src = lookup(ctx.revenueSource, line.sourceId);
  if (src === "direct_booking") return true;
  if (descContains(line, "direct booking", "direct-booking", "direct_booking")) {
    return true;
  }
  return false;
}

export function statementLineBelongsToOtaBooking(
  line: StatementLineInput,
  ctx: ClassificationContext,
): boolean {
  if (line.lineType !== "revenue") return false;
  // Direct booking always wins.
  if (statementLineBelongsToDirectBooking(line, ctx)) return false;
  const channel = lookup(ctx.channelKey, line.sourceId);
  if (channel && OTA_CHANNEL_KEYS.has(channel.toLowerCase())) return true;
  const rt = lookup(ctx.revenueType, line.sourceId);
  if (rt) {
    const lower = rt.toLowerCase();
    if (lower === "nightly" || lower === "ota_accommodation") return true;
  }
  const src = lookup(ctx.revenueSource, line.sourceId);
  if (src === "booking" || src === "booking_channel") return true;
  if (descContains(line, "airbnb", "booking.com", "vrbo", "agoda", "expedia")) {
    return true;
  }
  return false;
}

export function statementLineBelongsToGuestService(
  line: StatementLineInput,
  ctx: ClassificationContext,
): boolean {
  if (line.lineType !== "revenue") return false;
  if (line.sourceId && ctx.guestServiceSourceIds?.has(line.sourceId)) return true;
  const rt = lookup(ctx.revenueType, line.sourceId);
  if (rt) {
    const l = rt.toLowerCase();
    if (l.includes("guest_service") || l.includes("upsell") || l.includes("concierge")) {
      return true;
    }
  }
  const src = lookup(ctx.revenueSource, line.sourceId);
  if (src === "guest_service_order") return true;
  if (descContains(line, "guest service", "concierge", "upsell")) return true;
  return false;
}

export function statementLineBelongsToOwnerStay(
  line: StatementLineInput,
  ctx: ClassificationContext,
): boolean {
  if (line.sourceId && ctx.ownerStaySourceIds?.has(line.sourceId)) return true;
  const expenseType = lookup(ctx.expenseType, line.sourceId);
  if (expenseType && expenseType.includes("owner_stay")) return true;
  if (descContains(line, "owner stay", "owner-stay", "owner_stay")) return true;
  return false;
}

export function statementLineBelongsToMaintenance(line: StatementLineInput): boolean {
  if (line.lineType !== "expense") return false;
  return descContains(
    line,
    "maintenance",
    "repair",
    "preventive",
    "service ticket",
  );
}

export function statementLineBelongsToUtility(line: StatementLineInput): boolean {
  if (line.lineType !== "expense") return false;
  return descContains(
    line,
    "utility",
    "electric",
    "water bill",
    "internet",
    "wifi",
    "gas bill",
  );
}

export function statementLineBelongsToInventory(line: StatementLineInput): boolean {
  if (line.lineType !== "expense") return false;
  return descContains(
    line,
    "inventory",
    "consumable",
    "supplies",
    "linen",
    "amenity",
    "amenities",
  );
}

export function statementLineBelongsToServiceFulfilment(
  line: StatementLineInput,
  ctx: ClassificationContext,
): boolean {
  if (line.lineType !== "expense") return false;
  if (line.sourceId && ctx.serviceFulfilmentSourceIds?.has(line.sourceId)) return true;
  const expenseType = lookup(ctx.expenseType, line.sourceId);
  if (expenseType && expenseType.includes("service_fulfilment")) return true;
  if (descContains(line, "service fulfilment", "vendor invoice", "concierge fulfilment")) {
    return true;
  }
  return false;
}

export function statementLineBelongsToReserve(line: StatementLineInput): boolean {
  return line.lineType === "reserve";
}

export function statementLineBelongsToTax(line: StatementLineInput): boolean {
  if (line.lineType === "tax") return true;
  if (line.lineType === "fee") return true;
  return false;
}

export function statementLineBelongsToManagementFee(line: StatementLineInput): boolean {
  return line.lineType === "management_fee";
}

export function statementLineBelongsToPayout(line: StatementLineInput): boolean {
  return line.lineType === "payout";
}

export function statementLineBelongsToAdjustment(line: StatementLineInput): boolean {
  return line.lineType === "adjustment";
}

// -----------------------------------------------------------------------------
// Classifier
// -----------------------------------------------------------------------------

/**
 * Pure: assign exactly one group key to a statement line.  Order
 * matters — direct booking beats OTA, owner-stay charges beat
 * generic expense categories, etc.
 */
export function classifyStatementLineSource(
  line: StatementLineInput,
  ctx: ClassificationContext = {},
): StatementGroupKey {
  // Revenue side.
  if (statementLineBelongsToDirectBooking(line, ctx)) return "direct_booking_revenue";
  if (statementLineBelongsToGuestService(line, ctx)) return "guest_service_revenue";
  if (statementLineBelongsToOtaBooking(line, ctx)) return "ota_revenue";
  // Owner stay always wins over the generic expense categories.
  if (statementLineBelongsToOwnerStay(line, ctx)) return "owner_stay_charges";
  // Service fulfilment vendor cost.
  if (statementLineBelongsToServiceFulfilment(line, ctx))
    return "service_fulfilment_costs";
  // Cost categories.
  if (statementLineBelongsToMaintenance(line)) return "maintenance_charges";
  if (statementLineBelongsToUtility(line)) return "utility_charges";
  if (statementLineBelongsToInventory(line)) return "inventory_charges";
  // Standard finance buckets.
  if (statementLineBelongsToManagementFee(line)) return "management_fees";
  if (statementLineBelongsToTax(line)) return "taxes";
  if (statementLineBelongsToReserve(line)) return "reserves";
  if (statementLineBelongsToPayout(line)) return "payouts";
  if (statementLineBelongsToAdjustment(line)) return "adjustments";
  // Catch-all.
  if (line.lineType === "revenue") return "other";
  if (line.lineType === "expense") return "other";
  return "other";
}

// -----------------------------------------------------------------------------
// Direction
// -----------------------------------------------------------------------------

export type LineDirection = "revenue" | "deduction" | "neutral";

export function directionForStatementLine(
  line: StatementLineInput,
  groupKey: StatementGroupKey,
): LineDirection {
  if (
    groupKey === "direct_booking_revenue" ||
    groupKey === "ota_revenue" ||
    groupKey === "guest_service_revenue"
  ) {
    return "revenue";
  }
  if (groupKey === "reserves") {
    // Reserves can be additions (deduct from payout) or releases
    // (revenue-like).  Use the sign as a best-effort hint.
    return line.amountMinor > 0n ? "deduction" : "revenue";
  }
  if (groupKey === "payouts") return "neutral";
  if (groupKey === "adjustments") {
    return line.amountMinor < 0n ? "deduction" : "revenue";
  }
  // Everything else (charges, fees, taxes, mgmt fee, owner stay, etc.)
  // is treated as a deduction from the gross.
  return "deduction";
}

// -----------------------------------------------------------------------------
// Aggregation
// -----------------------------------------------------------------------------

export interface StatementSourceGroupAggregate {
  groupKey: StatementGroupKey;
  groupLabel: string;
  groupDescription: string;
  grossAmountMinor: bigint;
  deductionAmountMinor: bigint;
  netAmountMinor: bigint;
  currency: string;
  lineCount: number;
  sortOrder: number;
  ownerVisible: boolean;
  /** All lines bucketed into this group, in original sort_order. */
  lines: StatementLineInput[];
}

/**
 * Pure: bucket statement lines into a deterministic list of group
 * aggregates.  The list is ordered by `sortOrder`, and each group's
 * `lines` are ordered by their original `sortOrder` ascending.
 */
export function buildStatementSourceGroups(
  lines: ReadonlyArray<StatementLineInput>,
  ctx: ClassificationContext = {},
): StatementSourceGroupAggregate[] {
  const buckets = new Map<
    string,
    StatementSourceGroupAggregate
  >();
  for (const line of lines) {
    const groupKey = classifyStatementLineSource(line, ctx);
    const direction = directionForStatementLine(line, groupKey);
    const key = `${groupKey}|${line.currency}`;
    let agg = buckets.get(key);
    if (!agg) {
      agg = {
        groupKey,
        groupLabel: groupKeyToOwnerLabel(groupKey),
        groupDescription: groupKeyToDescription(groupKey),
        grossAmountMinor: 0n,
        deductionAmountMinor: 0n,
        netAmountMinor: 0n,
        currency: line.currency,
        lineCount: 0,
        sortOrder: groupKeySortOrder(groupKey),
        ownerVisible: isOwnerVisibleGroup(groupKey),
        lines: [],
      };
      buckets.set(key, agg);
    }
    agg.lines.push(line);
    agg.lineCount += 1;
    if (direction === "revenue") {
      agg.grossAmountMinor += abs(line.amountMinor);
    } else if (direction === "deduction") {
      agg.deductionAmountMinor += abs(line.amountMinor);
    }
  }
  for (const agg of buckets.values()) {
    agg.netAmountMinor = agg.grossAmountMinor - agg.deductionAmountMinor;
    agg.lines.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.currency.localeCompare(b.currency);
  });
}

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

// -----------------------------------------------------------------------------
// Group-line bridge
// -----------------------------------------------------------------------------

export interface StatementGroupLineBridge {
  statementLineId: string;
  groupKey: StatementGroupKey;
  ownerVisibleLabel: string;
  internalSourceTable: string | null;
  internalSourceId: string | null;
  sourceTraceStatus:
    | "linked"
    | "missing_source"
    | "ambiguous_source"
    | "estimated"
    | "manual_adjustment"
    | "archived_source";
}

/**
 * Pure: produce one bridge row per statement line.
 *
 * The owner-visible label is a short owner-safe descriptor that the
 * UI / PDF can show alongside the line, derived from the group label
 * and the statement line description.  `sourceTraceStatus` is
 * `missing_source` when the line has no source_id, `manual_adjustment`
 * for adjustment lines, otherwise `linked`.
 */
export function buildStatementGroupLines(
  lines: ReadonlyArray<StatementLineInput>,
  groups: ReadonlyArray<StatementSourceGroupAggregate>,
): StatementGroupLineBridge[] {
  const groupKeyByLineId = new Map<string, StatementGroupKey>();
  for (const g of groups) {
    for (const line of g.lines) {
      groupKeyByLineId.set(line.id, g.groupKey);
    }
  }
  const out: StatementGroupLineBridge[] = [];
  for (const line of lines) {
    const groupKey = groupKeyByLineId.get(line.id) ?? "other";
    let traceStatus: StatementGroupLineBridge["sourceTraceStatus"];
    if (groupKey === "adjustments") {
      traceStatus = "manual_adjustment";
    } else if (!line.sourceId) {
      traceStatus = "missing_source";
    } else {
      traceStatus = "linked";
    }
    out.push({
      statementLineId: line.id,
      groupKey,
      ownerVisibleLabel: formatOwnerSafeSourceLabel({
        groupKey,
        description: line.description,
      }),
      internalSourceTable: line.sourceTable,
      internalSourceId: line.sourceId,
      sourceTraceStatus: traceStatus,
    });
  }
  return out;
}

/**
 * Pure: render a short owner-safe label for a single statement line.
 * Strips internal-vocabulary tokens so the owner sees, e.g., "Direct
 * booking accommodation revenue" instead of the raw revenue-line
 * description that may contain a booking code or guest reference.
 */
export function formatOwnerSafeSourceLabel(input: {
  groupKey: StatementGroupKey;
  description: string;
}): string {
  const { groupKey, description } = input;
  const desc = (description ?? "").trim();
  if (!desc) return groupKeyToOwnerLabel(groupKey);
  // Trim long booking codes and guest references — owners don't need
  // them in the label.
  const cleaned = desc
    .replace(/\b[A-Z]{2,4}-[0-9A-Z-]{4,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned.length === 0) return groupKeyToOwnerLabel(groupKey);
  if (cleaned.length > 80) return `${cleaned.slice(0, 77)}…`;
  return cleaned;
}
