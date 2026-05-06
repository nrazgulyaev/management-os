/**
 * Pure explainer helpers — one set of admin-facing labels with full
 * pricing strategy detail; one set of public-facing labels that
 * collapse internal categories so guests / OTA shoppers never see
 * what's behind the modifier stack.
 */
import type { QuoteNight, QuoteStay } from "./quote-pure";

// -----------------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------------

export interface AdminExplanationLine {
  label: string;
  detail: string | null;
}

export function buildNightlyPricingExplanation(
  night: QuoteNight,
): AdminExplanationLine[] {
  const out: AdminExplanationLine[] = [];
  out.push({
    label: night.date,
    detail: `Final ${formatMinor(night.finalRateMinor, night.currency)}${
      night.available ? "" : ` · ${night.unavailableReason}`
    }`,
  });
  for (const step of night.explanationSteps) {
    const delta =
      step.amountDeltaMinor != null && step.amountDeltaMinor !== 0n
        ? ` (${step.amountDeltaMinor > 0n ? "+" : ""}${formatMinor(step.amountDeltaMinor, night.currency)})`
        : "";
    out.push({ label: step.label, detail: `${formatMinor(step.afterMinor, night.currency)}${delta}` });
  }
  return out;
}

export function buildStayPricingExplanation(
  stay: QuoteStay,
): AdminExplanationLine[] {
  const out: AdminExplanationLine[] = [];
  out.push({
    label: `${stay.checkIn} → ${stay.checkOut}`,
    detail: stay.available
      ? `${stay.nights} nights · ${formatMinor(stay.totalMinor, stay.currency)} · avg ${formatMinor(stay.averageNightlyMinor, stay.currency)}`
      : stay.reason,
  });
  if (stay.requiredMinLos != null) {
    out.push({
      label: "Min LOS",
      detail: `${stay.requiredMinLos} nights${stay.minLosName ? ` · ${stay.minLosName}` : ""}`,
    });
  }
  for (const n of stay.nightly) {
    out.push({
      label: n.date,
      detail: n.available
        ? formatMinor(n.finalRateMinor, n.currency)
        : `× ${n.unavailableReason ?? "unavailable"}`,
    });
  }
  return out;
}

export function buildAdminCalendarCellTooltip(cell: {
  date: string;
  finalRateMinor: bigint;
  currency: string;
  reason: string;
  ruleSetName?: string | null;
}): string {
  return `${cell.date} · ${formatMinor(cell.finalRateMinor, cell.currency)} · ${cell.reason}${
    cell.ruleSetName ? ` · ${cell.ruleSetName}` : ""
  }`;
}

// -----------------------------------------------------------------------------
// Public
// -----------------------------------------------------------------------------

export interface PublicQuoteSummary {
  available: boolean;
  reason: "ok" | "min_los" | "stop_sell" | "unavailable" | "no_nights";
  averageNightlyMinor: bigint;
  totalMinor: bigint;
  currency: string;
  nights: number;
  message: string;
  minLosRequired: number | null;
}

/**
 * Pure: build the public-facing summary. Crucially this NEVER carries
 * rule_set_id, no internal modifier breakdown, no owner / maintenance
 * detail.
 */
export function buildPublicQuoteSummary(stay: QuoteStay): PublicQuoteSummary {
  const reason = collapsePublicReason(stay.reason);
  const message = publicMessage(reason, stay);
  return {
    available: stay.available,
    reason,
    averageNightlyMinor: stay.averageNightlyMinor,
    totalMinor: stay.totalMinor,
    currency: stay.currency,
    nights: stay.nights,
    message,
    minLosRequired: stay.requiredMinLos ?? null,
  };
}

function collapsePublicReason(
  r: QuoteStay["reason"],
): PublicQuoteSummary["reason"] {
  switch (r) {
    case "ok":
      return "ok";
    case "no_nights":
      return "no_nights";
    case "stop_sell":
      return "stop_sell";
    case "min_los":
      return "min_los";
    default:
      return "unavailable";
  }
}

function publicMessage(
  reason: PublicQuoteSummary["reason"],
  stay: QuoteStay,
): string {
  switch (reason) {
    case "ok":
      return `${stay.nights} nights · ${formatMinor(stay.totalMinor, stay.currency)}`;
    case "no_nights":
      return "Please pick check-in and check-out dates.";
    case "stop_sell":
      return "These dates are not currently bookable.";
    case "min_los":
      return `Minimum stay ${stay.requiredMinLos ?? "?"} nights.`;
    case "unavailable":
      return "Some nights are not available.";
  }
}

// -----------------------------------------------------------------------------
// internal money formatter (admin-only)
// -----------------------------------------------------------------------------

function formatMinor(amount: bigint | number, currency: string): string {
  const v = typeof amount === "bigint" ? amount : BigInt(Math.trunc(amount));
  const major = v / 100n;
  const minor = v % 100n;
  const sign = v < 0n ? "-" : "";
  const abs = v < 0n ? -major : major;
  const minorAbs = v < 0n ? -minor : minor;
  return `${sign}${abs.toString()}.${String(minorAbs).padStart(2, "0")} ${currency}`;
}
