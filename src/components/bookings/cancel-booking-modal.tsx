"use client";

import * as React from "react";
import { DestructiveConfirmModal } from "@/components/ui/modal";
import { computeRefund } from "@/features/bookings/cancellation-policy";

/**
 * Phase 2.2 mgmt-01 — CancelBookingModal.
 *
 * Computes refund from `computeRefund` (policy ladder) and offers a
 * Director-override checkbox plus a notify-guest toggle.
 */

export interface CancelBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    code: string;
    grossAmount: number;
    checkIn: string;
    channel?: string;
  } | null;
  /** Pass true if the current operator has Director scope. */
  canOverride?: boolean;
  onConfirm?: (input: { refundAmount: number; pct: number; notifyGuest: boolean; reason: string }) => Promise<void> | void;
}

export function CancelBookingModal({
  open,
  onOpenChange,
  booking,
  canOverride,
  onConfirm,
}: CancelBookingModalProps) {
  const [override, setOverride] = React.useState(false);
  const [notify, setNotify] = React.useState(true);

  React.useEffect(() => {
    if (!open) {
      setOverride(false);
      setNotify(true);
    }
  }, [open]);

  if (!booking) {
    return null;
  }

  const refund = computeRefund({
    grossAmount: booking.grossAmount,
    checkIn: booking.checkIn,
    channel: booking.channel,
    directorOverride: override,
  });

  return (
    <DestructiveConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel ${booking.code}?`}
      body={
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          <p style={{ margin: "4px 0 8px" }}>
            <b style={{ color: "var(--ink)" }}>{refund.pct}% refund · ${refund.amount.toLocaleString()}</b>
            {" "}({Math.max(0, refund.daysToCheckIn)}d to arrival · {refund.reason.replace("-", " ")}).
          </p>
          {canOverride && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Director override (force 100% refund)
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Notify guest by email
          </label>
        </div>
      }
      confirmLabel="Cancel & refund"
      cancelLabel="Keep booking"
      onConfirm={async () => {
        await onConfirm?.({
          refundAmount: refund.amount,
          pct: refund.pct,
          notifyGuest: notify,
          reason: refund.reason,
        });
      }}
    />
  );
}
