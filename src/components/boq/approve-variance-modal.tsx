"use client";

import * as React from "react";
import { ConfirmModal } from "@/components/ui/modal";

/**
 * Phase 2.2 dev-03 — ApproveVarianceModal.
 *
 * Confirm + reason capture. The QS signs off; the reason text is
 * written into `variance_reviews.reason` so the audit log carries
 * the rationale forward.
 */

export interface ApproveVarianceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineCode: string;
  impactUsd: number;
  onConfirm?: (reason: string) => Promise<void> | void;
}

export function ApproveVarianceModal({
  open,
  onOpenChange,
  lineCode,
  impactUsd,
  onConfirm,
}: ApproveVarianceModalProps) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Approve variance on ${lineCode}?`}
      body={
        <>
          <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--ink-3)" }}>
            Cost impact: <b style={{ color: "var(--ink)" }}>${impactUsd.toLocaleString()}</b>. The line moves out of the variance queue once approved.
          </p>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
            Reason (logged into variance_reviews)
          </label>
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this variance acceptable?"
          />
        </>
      }
      confirmLabel="Approve variance"
      onConfirm={async () => {
        if (!reason.trim()) return;
        await onConfirm?.(reason.trim());
      }}
    />
  );
}
