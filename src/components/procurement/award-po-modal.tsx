"use client";

import * as React from "react";
import { ConfirmModal } from "@/components/ui/modal";

/**
 * Phase 2.2 dev-04 — AwardPoModal.
 *
 * Confirm + reason capture. Submit auto-creates a `purchase_orders`
 * row from the winning quote in 2.2 data.
 */

export interface AwardPoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfqId: string;
  winnerVendorName: string;
  winnerTotalUsd: number;
  onConfirm?: (reason: string) => Promise<void> | void;
}

export function AwardPoModal({
  open,
  onOpenChange,
  rfqId,
  winnerVendorName,
  winnerTotalUsd,
  onConfirm,
}: AwardPoModalProps) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Award ${rfqId} to ${winnerVendorName}?`}
      body={
        <>
          <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--ink-3)" }}>
            Total: <b style={{ color: "var(--ink)" }}>${winnerTotalUsd.toLocaleString()}</b>.
            A purchase order is generated automatically and routed to the
            CFO for sign-off.
          </p>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
            Reason
          </label>
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why this vendor? (logged into purchase_orders.notes)"
          />
        </>
      }
      confirmLabel="Award PO"
      onConfirm={async () => {
        if (!reason.trim()) return;
        await onConfirm?.(reason.trim());
      }}
    />
  );
}
