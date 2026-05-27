import * as React from "react";
import { DeltaPill } from "./delta-pill";
import { computeVariance } from "@/features/boq/variance";

/**
 * Phase 2.2 dev-03 — VarianceCard (QS workspace row).
 *
 * Three-column grid:
 *   1. ref + delta pill
 *   2. line title + contractor explanation + 4 actions
 *   3. num-grid (planned · actual · qty Δ · rate Δ)
 */

export interface VarianceCardProps {
  lineId: string;
  code: string;
  description: string;
  wpCode: string;
  unit: string;
  qtyPlanned: number;
  ratePlanned: number;
  qtyActual: number;
  rateActual: number;
  /** Optional contractor-supplied explanation. */
  contractorReason?: string;
  /** Action handlers — wired by the QS workspace. */
  onInvestigate?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestReason?: () => void;
}

export function VarianceCard({
  code,
  description,
  wpCode,
  unit,
  qtyPlanned,
  ratePlanned,
  qtyActual,
  rateActual,
  contractorReason,
  onInvestigate,
  onApprove,
  onReject,
  onRequestReason,
}: VarianceCardProps) {
  const v = computeVariance(
    { qty: qtyPlanned, rate: ratePlanned },
    qtyActual > 0 ? { qty: qtyActual, rate: rateActual } : null,
  );

  return (
    <div className="variance-card">
      <div className="vc-left">
        <span className="vc-code mono">{code}</span>
        <DeltaPill value={v.actual} baseline={v.planned} tone={v.tone} kind="cost" />
        <span className="vc-wp mono">{wpCode}</span>
      </div>
      <div className="vc-middle">
        <div className="vc-title">{description}</div>
        {contractorReason && (
          <div className="vc-reason">
            <span className="vc-reason-label">Contractor:</span> {contractorReason}
          </div>
        )}
        <div className="vc-actions">
          {onInvestigate && (
            <button className="btn btn-ghost btn-sm" onClick={onInvestigate}>
              Investigate
            </button>
          )}
          {onRequestReason && (
            <button className="btn btn-ghost btn-sm" onClick={onRequestReason}>
              Request reason
            </button>
          )}
          {onReject && (
            <button className="btn btn-secondary btn-sm" onClick={onReject}>
              Reject
            </button>
          )}
          {onApprove && (
            <button className="btn btn-primary btn-sm" onClick={onApprove}>
              Approve
            </button>
          )}
        </div>
      </div>
      <div className="vc-right">
        <Stat label="Planned" value={`${qtyPlanned} ${unit} × ${ratePlanned.toFixed(2)}`} />
        <Stat label="Actual" value={`${qtyActual} ${unit} × ${rateActual.toFixed(2)}`} />
        <Stat label="Δ total" value={`${v.delta > 0 ? "+" : ""}${v.delta.toFixed(0)}`} tone={v.tone} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="vc-stat" data-tone={tone}>
      <span className="vc-stat-label">{label}</span>
      <span className="vc-stat-value mono">{value}</span>
    </div>
  );
}
