/**
 * Prompt 108 — Pure helper that groups owner-statement lines by the
 * underlying revenue source.  Used by `StatementDetail` to add a
 * "Revenue source explanation" panel without leaking source IDs.
 */

import type { StatementLineRow } from "@/features/finance/services";

export type StatementLineSourceBucketKey =
  | "direct_booking"
  | "ota"
  | "guest_services"
  | "owner_stay"
  | "maintenance_reserve"
  | "tax_fee"
  | "other";

export interface StatementLineSourceBucket {
  key: StatementLineSourceBucketKey;
  label: string;
  description: string;
  lines: StatementLineRow[];
  totalMinor: bigint;
  currency: string | null;
}

const BUCKET_LABELS: Record<
  StatementLineSourceBucketKey,
  { label: string; description: string }
> = {
  direct_booking: {
    label: "Direct booking revenue",
    description:
      "Revenue from bookings made directly through Arconique (no OTA commission).",
  },
  ota: {
    label: "OTA revenue",
    description:
      "Revenue from third-party platform bookings (Airbnb, Booking.com, Vrbo, etc.).",
  },
  guest_services: {
    label: "Guest services",
    description: "Service upsells and concierge revenue.",
  },
  owner_stay: {
    label: "Owner stay charges",
    description: "Operational charges associated with owner stays.",
  },
  maintenance_reserve: {
    label: "Maintenance / reserves",
    description: "Reserve movements and maintenance accruals.",
  },
  tax_fee: {
    label: "Taxes / fees",
    description: "Statutory taxes, channel fees, and platform fees.",
  },
  other: {
    label: "Other adjustments",
    description: "Manual entries and adjustments.",
  },
};

export function classifyStatementLine(
  line: StatementLineRow,
): StatementLineSourceBucketKey {
  const desc = (line.description ?? "").toLowerCase();
  const cat = (line.category ?? "").toLowerCase();
  if (line.lineType === "tax" || line.lineType === "fee") return "tax_fee";
  if (line.lineType === "expense" || line.lineType === "reserve") {
    return "maintenance_reserve";
  }
  if (line.lineType === "adjustment") return "other";
  if (line.lineType === "management_fee") return "tax_fee";
  // Revenue line types — split direct vs OTA vs services.
  if (
    cat.includes("direct_booking") ||
    desc.includes("direct booking") ||
    desc.includes("direct-booking")
  ) {
    return "direct_booking";
  }
  if (cat.includes("ota") || cat.includes("airbnb") || cat.includes("booking_com")) {
    return "ota";
  }
  if (cat.includes("service") || cat.includes("upsell")) {
    return "guest_services";
  }
  if (cat.includes("owner_stay") || desc.includes("owner stay")) {
    return "owner_stay";
  }
  // Default for revenue lines: OTA (since OTAs dominate today; direct
  // bookings will be flagged by category once the projection has run).
  if (line.lineType === "revenue") return "ota";
  return "other";
}

/**
 * Pure: bucket statement lines by source.  Order is stable —
 * direct_booking → ota → services → owner_stay → reserves → taxes →
 * other.
 */
export function groupStatementLinesBySource(
  lines: ReadonlyArray<StatementLineRow>,
): StatementLineSourceBucket[] {
  const order: StatementLineSourceBucketKey[] = [
    "direct_booking",
    "ota",
    "guest_services",
    "owner_stay",
    "maintenance_reserve",
    "tax_fee",
    "other",
  ];
  const map = new Map<StatementLineSourceBucketKey, StatementLineSourceBucket>();
  for (const key of order) {
    map.set(key, {
      key,
      label: BUCKET_LABELS[key].label,
      description: BUCKET_LABELS[key].description,
      lines: [],
      totalMinor: 0n,
      currency: null,
    });
  }
  for (const line of lines) {
    const key = classifyStatementLine(line);
    const bucket = map.get(key)!;
    bucket.lines.push(line);
    bucket.totalMinor += line.amountMinor;
    if (!bucket.currency) bucket.currency = line.currency;
  }
  return Array.from(map.values()).filter((b) => b.lines.length > 0);
}

/**
 * Pure: assert that the rendered statement source labels never include
 * a raw revenue_lines / direct_booking_finance_links / statement_period
 * id.  Runtime assertion used by the test grep.
 */
export function statementSourceCopyContainsNoSourceIds(
  copy: string,
): boolean {
  const banned = [
    "revenue_line_id",
    "revenueLineId",
    "finance_link_id",
    "financeLinkId",
    "statement_period_id",
    "statementPeriodId",
  ];
  for (const b of banned) {
    if (copy.includes(b)) return false;
  }
  return true;
}
