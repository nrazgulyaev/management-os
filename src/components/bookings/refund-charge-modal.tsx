"use client";

import * as React from "react";
import { DestructiveConfirmModal } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-01 — RefundChargeModal.
 *
 * Destructive-sm. Refund an existing booking charge — full or
 * partial. Routes through the payment provider in 2.2 data.
 */

export interface RefundChargeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: { id: string; label: string; amount: number; currency: string } | null;
  onConfirm?: (input: { chargeId: string; refundAmount: number; reason: string }) => Promise<void> | void;
}

export function RefundChargeModal({ open, onOpenChange, charge, onConfirm }: RefundChargeModalProps) {
  const [partial, setPartial] = React.useState(false);
  const [amount, setAmount] = React.useState(0);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open && charge) {
      setPartial(false);
      setAmount(charge.amount);
      setReason("");
    }
  }, [open, charge]);

  if (!charge) return null;

  return (
    <DestructiveConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Refund ${charge.label}?`}
      body={
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          <p style={{ margin: "4px 0 8px" }}>
            Original charge: <b style={{ color: "var(--ink)" }}>{charge.currency} {charge.amount.toLocaleString()}</b>.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
            <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
            Partial refund
          </label>
          {partial && (
            <div className="field" style={{ marginTop: 6 }}>
              <label className="field-label">Refund amount ({charge.currency})</label>
              <input
                className="input mono"
                type="number"
                min={0}
                max={charge.amount}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
          )}
          <div className="field" style={{ marginTop: 6 }}>
            <label className="field-label">Reason</label>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>
      }
      confirmLabel="Refund"
      onConfirm={async () => {
        if (!reason.trim()) return;
        await onConfirm?.({ chargeId: charge.id, refundAmount: partial ? amount : charge.amount, reason: reason.trim() });
      }}
    />
  );
}
