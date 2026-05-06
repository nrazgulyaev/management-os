/**
 * Prompt 110 — Pure helpers for statement reconciliation warnings.
 *
 * No DB / no `server-only` import.  These functions take pre-loaded
 * bridge / projection state and decide which warnings should be
 * raised, with what severity, and whether they're owner-visible.
 */

// -----------------------------------------------------------------------------
// Taxonomy
// -----------------------------------------------------------------------------

export type WarningType =
  | "pending_direct_booking_revenue"
  | "pending_guest_service_revenue"
  | "pending_owner_stay_charge"
  | "pending_material_usage_charge"
  | "pending_service_fulfilment_bridge"
  | "locked_period_skipped"
  | "missing_statement_line"
  | "missing_source_trace"
  | "unallocated_expense"
  | "negative_payout"
  | "currency_mismatch"
  | "stale_projection"
  | "manual_review_required"
  | "duplicate_source_risk"
  | "other";

export const WARNING_TYPES: ReadonlyArray<WarningType> = [
  "pending_direct_booking_revenue",
  "pending_guest_service_revenue",
  "pending_owner_stay_charge",
  "pending_material_usage_charge",
  "pending_service_fulfilment_bridge",
  "locked_period_skipped",
  "missing_statement_line",
  "missing_source_trace",
  "unallocated_expense",
  "negative_payout",
  "currency_mismatch",
  "stale_projection",
  "manual_review_required",
  "duplicate_source_risk",
  "other",
];

export type WarningSeverity = "info" | "warning" | "critical";
export type WarningStatus = "open" | "acknowledged" | "resolved" | "dismissed";

// -----------------------------------------------------------------------------
// Owner-facing copy
// -----------------------------------------------------------------------------

const OWNER_TITLES: Record<WarningType, string | null> = {
  pending_direct_booking_revenue: "A booking is awaiting reconciliation",
  pending_guest_service_revenue: "A guest service is awaiting reconciliation",
  pending_owner_stay_charge: "An owner-stay charge is being prepared",
  pending_material_usage_charge: "A maintenance charge is being prepared",
  pending_service_fulfilment_bridge:
    "A service fulfilment cost is being prepared",
  locked_period_skipped: "A finance item could not be posted automatically",
  negative_payout: "This statement closes with a deficit",
  currency_mismatch: "Mixed currencies were detected on this statement",
  // Internal-only by default.
  missing_statement_line: null,
  missing_source_trace: null,
  unallocated_expense: null,
  stale_projection: null,
  manual_review_required: null,
  duplicate_source_risk: null,
  other: null,
};

const OWNER_MESSAGES: Record<WarningType, string | null> = {
  pending_direct_booking_revenue:
    "A direct booking has been confirmed but its revenue has not yet appeared in this statement. It is expected to be included after finance reconciliation.",
  pending_guest_service_revenue:
    "A guest service has been delivered but its revenue has not yet appeared in this statement.",
  pending_owner_stay_charge:
    "An owner stay was used during this period; the related charge is being prepared and will appear in a future statement if not yet posted.",
  pending_material_usage_charge:
    "A maintenance task used materials that have not yet been billed to this statement. The team will reconcile the cost shortly.",
  pending_service_fulfilment_bridge:
    "A service fulfilment cost is still being processed. It will appear once the vendor invoice is reconciled.",
  locked_period_skipped:
    "One finance item could not be posted automatically because the accounting period is locked. The team will review it manually.",
  negative_payout:
    "Charges exceeded revenue this period. Please review the deductions section before approving.",
  currency_mismatch:
    "More than one currency appears on this statement. Conversion is not applied automatically. Please contact the finance team if this affects you.",
  missing_statement_line: null,
  missing_source_trace: null,
  unallocated_expense: null,
  stale_projection: null,
  manual_review_required: null,
  duplicate_source_risk: null,
  other: null,
};

const INTERNAL_TITLES: Record<WarningType, string> = {
  pending_direct_booking_revenue: "Pending direct-booking revenue",
  pending_guest_service_revenue: "Pending guest-service revenue",
  pending_owner_stay_charge: "Pending owner-stay charge",
  pending_material_usage_charge: "Pending material-usage charge",
  pending_service_fulfilment_bridge: "Pending service fulfilment bridge",
  locked_period_skipped: "Locked-period skip",
  missing_statement_line: "Missing statement line",
  missing_source_trace: "Missing source trace",
  unallocated_expense: "Unallocated expense",
  negative_payout: "Negative payout detected",
  currency_mismatch: "Currency mismatch",
  stale_projection: "Stale projection",
  manual_review_required: "Manual review required",
  duplicate_source_risk: "Possible duplicate source",
  other: "Reconciliation note",
};

const INTERNAL_MESSAGES: Record<WarningType, string> = {
  pending_direct_booking_revenue:
    "A direct-booking finance link is in `pending` status for a converted booking that overlaps this statement period.",
  pending_guest_service_revenue:
    "A guest-service finance bridge is in `pending` status for an order that completed in this period.",
  pending_owner_stay_charge:
    "An owner-stay request was approved with a billable charge that has not yet bridged to expense_lines / management_fee_lines.",
  pending_material_usage_charge:
    "A task material-usage event has not been bridged to expense_lines for this period.",
  pending_service_fulfilment_bridge:
    "A service-fulfilment bridge row is `pending` and has not produced revenue/expense lines yet.",
  locked_period_skipped:
    "A finance bridge attempted to post into a locked statement period and skipped. Manual journal review is required.",
  missing_statement_line:
    "A linked finance row exists upstream but no matching statement_lines row is present.",
  missing_source_trace:
    "A statement_lines row has no source_table / source_id — likely a manual entry that needs trace metadata.",
  unallocated_expense:
    "An expense_lines row has not been allocated to any owner via expense_allocations.",
  negative_payout:
    "Statement net payout is negative for this period.",
  currency_mismatch:
    "Statement_lines for this statement contain more than one currency.",
  stale_projection:
    "The owner-booking projection or transparency snapshot is older than the underlying statement edits.",
  manual_review_required:
    "Operator flagged this statement for manual review before approval.",
  duplicate_source_risk:
    "Two statement_lines reference the same upstream source row.",
  other: "Operational note attached to this statement.",
};

const SEVERITY_DEFAULTS: Record<WarningType, WarningSeverity> = {
  pending_direct_booking_revenue: "warning",
  pending_guest_service_revenue: "info",
  pending_owner_stay_charge: "info",
  pending_material_usage_charge: "info",
  pending_service_fulfilment_bridge: "info",
  locked_period_skipped: "warning",
  missing_statement_line: "warning",
  missing_source_trace: "warning",
  unallocated_expense: "warning",
  negative_payout: "critical",
  currency_mismatch: "warning",
  stale_projection: "info",
  manual_review_required: "warning",
  duplicate_source_risk: "critical",
  other: "info",
};

// -----------------------------------------------------------------------------
// Accessors
// -----------------------------------------------------------------------------

export function warningTypeToOwnerTitle(type: WarningType): string | null {
  return OWNER_TITLES[type];
}

export function warningTypeToInternalTitle(type: WarningType): string {
  return INTERNAL_TITLES[type];
}

export function warningTypeToOwnerMessage(type: WarningType): string | null {
  return OWNER_MESSAGES[type];
}

export function warningTypeToInternalMessage(type: WarningType): string {
  return INTERNAL_MESSAGES[type];
}

export function warningSeverity(
  type: WarningType,
  ctx?: { statementStatus?: string },
): WarningSeverity {
  const base = SEVERITY_DEFAULTS[type];
  // Issued / approved statements raise the severity of pending revenue
  // because the missing item now affects an expected payout.
  const status = (ctx?.statementStatus ?? "").toLowerCase();
  if (
    (status === "issued" || status === "approved") &&
    (type === "pending_direct_booking_revenue" ||
      type === "pending_guest_service_revenue")
  ) {
    return "critical";
  }
  return base;
}

export function shouldOwnerSeeWarning(
  type: WarningType,
  ctx?: { statementStatus?: string },
): boolean {
  const ownerCopy = OWNER_TITLES[type];
  if (!ownerCopy) return false;
  // Pending bridges only surface to owners once the statement is at
  // least issued — owners shouldn't see noise on `draft`.
  const status = (ctx?.statementStatus ?? "").toLowerCase();
  if (
    type === "pending_direct_booking_revenue" ||
    type === "pending_guest_service_revenue" ||
    type === "pending_owner_stay_charge" ||
    type === "pending_material_usage_charge" ||
    type === "pending_service_fulfilment_bridge" ||
    type === "locked_period_skipped"
  ) {
    return status === "issued" || status === "approved" || status === "paid";
  }
  return true;
}

// -----------------------------------------------------------------------------
// Source / dedup
// -----------------------------------------------------------------------------

export interface NormalizedWarningSource {
  sourceTable: string | null;
  sourceId: string | null;
}

export function normalizeWarningSource(
  source: {
    sourceTable?: string | null;
    sourceId?: string | null;
  } | null,
): NormalizedWarningSource {
  if (!source) return { sourceTable: null, sourceId: null };
  return {
    sourceTable: source.sourceTable ?? null,
    sourceId: source.sourceId ?? null,
  };
}

export function dedupeWarningKey(
  type: WarningType,
  sourceTable: string | null,
  sourceId: string | null,
): string {
  return [type, sourceTable ?? "_", sourceId ?? "_"].join("|");
}

// -----------------------------------------------------------------------------
// Detection
// -----------------------------------------------------------------------------

export interface WarningCandidate {
  warningType: WarningType;
  severity: WarningSeverity;
  ownerVisible: boolean;
  ownerTitle: string | null;
  ownerMessage: string | null;
  internalTitle: string;
  internalMessage: string;
  sourceTable: string | null;
  sourceId: string | null;
  dedupeKey: string;
}

export interface DetectInput {
  statement: {
    id: string;
    status: string;
    netPayoutMinor: bigint;
    currency: string;
    periodStart: string;
    periodEnd: string;
    ownerId: string;
  };
  /** Statement lines used to detect mixed-currency / missing-source. */
  statementLines: ReadonlyArray<{
    id: string;
    currency: string;
    sourceTable: string | null;
    sourceId: string | null;
    lineType: string;
  }>;
  /** Pending bridge counts/sources, looked up by the rebuild service. */
  pendingDirectBookings: ReadonlyArray<{
    id: string;
    sourceTable: string;
  }>;
  pendingGuestServices: ReadonlyArray<{
    id: string;
    sourceTable: string;
  }>;
  pendingOwnerStays: ReadonlyArray<{
    id: string;
    sourceTable: string;
  }>;
  pendingServiceFulfilments: ReadonlyArray<{
    id: string;
    sourceTable: string;
  }>;
  /** finance links that skipped because of a locked period. */
  lockedPeriodSkipped: ReadonlyArray<{
    id: string;
    sourceTable: string;
  }>;
}

export function detectStatementWarnings(input: DetectInput): WarningCandidate[] {
  const out: WarningCandidate[] = [];
  const ctx = { statementStatus: input.statement.status };

  for (const row of input.pendingDirectBookings) {
    out.push(
      buildCandidate("pending_direct_booking_revenue", row.sourceTable, row.id, ctx),
    );
  }
  for (const row of input.pendingGuestServices) {
    out.push(
      buildCandidate("pending_guest_service_revenue", row.sourceTable, row.id, ctx),
    );
  }
  for (const row of input.pendingOwnerStays) {
    out.push(
      buildCandidate("pending_owner_stay_charge", row.sourceTable, row.id, ctx),
    );
  }
  for (const row of input.pendingServiceFulfilments) {
    out.push(
      buildCandidate(
        "pending_service_fulfilment_bridge",
        row.sourceTable,
        row.id,
        ctx,
      ),
    );
  }
  for (const row of input.lockedPeriodSkipped) {
    out.push(
      buildCandidate("locked_period_skipped", row.sourceTable, row.id, ctx),
    );
  }
  // Negative payout — one warning per statement.
  if (input.statement.netPayoutMinor < 0n) {
    out.push(
      buildCandidate(
        "negative_payout",
        "owner_statements",
        input.statement.id,
        ctx,
      ),
    );
  }
  // Currency mismatch — one warning per statement when ≥ 2 currencies.
  const currencies = new Set(input.statementLines.map((l) => l.currency));
  if (currencies.size > 1) {
    out.push(
      buildCandidate(
        "currency_mismatch",
        "owner_statements",
        input.statement.id,
        ctx,
      ),
    );
  }
  // Missing source trace — internal-only, one per offending line.
  for (const line of input.statementLines) {
    if (line.lineType === "adjustment") continue;
    if (line.sourceId) continue;
    out.push(
      buildCandidate("missing_source_trace", "statement_lines", line.id, ctx),
    );
  }
  return out;
}

function buildCandidate(
  type: WarningType,
  sourceTable: string | null,
  sourceId: string | null,
  ctx: { statementStatus: string },
): WarningCandidate {
  return {
    warningType: type,
    severity: warningSeverity(type, ctx),
    ownerVisible: shouldOwnerSeeWarning(type, ctx),
    ownerTitle: warningTypeToOwnerTitle(type),
    ownerMessage: warningTypeToOwnerMessage(type),
    internalTitle: warningTypeToInternalTitle(type),
    internalMessage: warningTypeToInternalMessage(type),
    sourceTable,
    sourceId,
    dedupeKey: dedupeWarningKey(type, sourceTable, sourceId),
  };
}

// -----------------------------------------------------------------------------
// Health score
// -----------------------------------------------------------------------------

export type ReconciliationStatusKey = "healthy" | "needs_review" | "critical";

export function buildReconciliationHealthScore(
  warnings: ReadonlyArray<{ severity: WarningSeverity; status: WarningStatus }>,
): number {
  let score = 100;
  for (const w of warnings) {
    if (w.status !== "open") continue;
    if (w.severity === "critical") score -= 25;
    else if (w.severity === "warning") score -= 10;
    else score -= 2;
  }
  return Math.max(0, score);
}

export function buildReconciliationStatus(
  warnings: ReadonlyArray<{ severity: WarningSeverity; status: WarningStatus }>,
): ReconciliationStatusKey {
  let warning = 0;
  let critical = 0;
  for (const w of warnings) {
    if (w.status !== "open") continue;
    if (w.severity === "critical") critical += 1;
    else if (w.severity === "warning") warning += 1;
  }
  if (critical > 0) return "critical";
  if (warning > 0) return "needs_review";
  return "healthy";
}
