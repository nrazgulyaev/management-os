"use client";

import * as React from "react";
import { DestructiveConfirmModal } from "@/components/ui/modal";

/**
 * Phase 2.2 dev-03 — RejectVarianceModal.
 *
 * Destructive-ish — pushes the variance back to the PM with a
 * mandatory reason. Records `variance_reviews.qs_decision = "reject"`.
 */

export interface RejectVarianceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineCode: string;
  onConfirm?: (reason: string) => Promise<void> | void;
}

export function RejectVarianceModal({
  open,
  onOpenChange,
  lineCode,
  onConfirm,
}: RejectVarianceModalProps) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <DestructiveConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Reject variance on ${lineCode}?`}
      body={
        <>
          <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--ink-3)" }}>
            The PM gets a task with this reason; the line stays in the
            variance queue until they resubmit with a fix.
          </p>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
            Reason
          </label>
          <textarea
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What needs to change before approval?"
          />
        </>
      }
      confirmLabel="Reject + push back"
      onConfirm={async () => {
        if (!reason.trim()) return;
        await onConfirm?.(reason.trim());
      }}
    />
  );
}
