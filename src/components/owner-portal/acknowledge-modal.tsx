"use client";

import * as React from "react";
import { ConfirmModal } from "@/components/ui/modal";

/**
 * Phase 2.3 owner-02 — AcknowledgeModal.
 *
 * Default focus = primary (template-06 ConfirmModal default). The
 * owner is confirming a position they're already comfortable with;
 * the modal is friction-by-design but not adversarial.
 */

export interface AcknowledgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statementCode: string;
  netAmount: number;
  currency: string;
  onConfirm?: () => Promise<void> | void;
}

export function AcknowledgeModal({
  open,
  onOpenChange,
  statementCode,
  netAmount,
  currency,
  onConfirm,
}: AcknowledgeModalProps) {
  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Acknowledge ${statementCode}?`}
      body={
        <>
          You're saying this statement looks correct. The number{" "}
          <b className="text-ink">
            {currency} {netAmount.toLocaleString()}
          </b>{" "}
          is what we'll wire on the next payout cycle.
          <br />
          <br />
          You can still raise a dispute later if something surfaces; acknowledgement
          isn't permanent.
        </>
      }
      confirmLabel="Acknowledge"
      cancelLabel="Not yet"
      onConfirm={async () => {
        await onConfirm?.();
      }}
    />
  );
}
