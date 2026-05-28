/**
 * Phase 2.4 mgmt-03 — Tax-export gating rule.
 *
 * Critical UX rule 2 for front office: monthly tax export is
 * BLOCKED while any unresolved visa flag exists in the period.
 * The gate fn is pure so it can be unit-tested + reused by the
 * registry page banner.
 */

export interface VisaFlagSummary {
  id: string;
  guestId: string;
  kind: "voa_expiring" | "overstay" | "kitas_check";
  severity: "warn" | "p1";
  resolvedAt?: string;
  periodMonth: string; // YYYY-MM
}

export interface TaxExportGateResult {
  allowed: boolean;
  blockingFlagIds: string[];
  reason?: string;
}

export function evaluateTaxExportGate(period: string, flags: VisaFlagSummary[]): TaxExportGateResult {
  const inPeriod = flags.filter((f) => f.periodMonth === period && !f.resolvedAt);
  if (inPeriod.length === 0) return { allowed: true, blockingFlagIds: [] };
  return {
    allowed: false,
    blockingFlagIds: inPeriod.map((f) => f.id),
    reason: `${inPeriod.length} unresolved visa flag(s) for ${period}`,
  };
}
