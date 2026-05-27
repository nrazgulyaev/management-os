"use client";

import * as React from "react";
import { ConfirmModal } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-02 — SendStatementModal.
 *
 * Confirm-sm. Sends to owner + unlocks portal view. Optional
 * personal note appended to the system email.
 */

export interface SendStatementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statementCode: string;
  ownerName: string;
  ownerEmail: string;
  onConfirm?: (note: string) => Promise<void> | void;
}

export function SendStatementModal({
  open,
  onOpenChange,
  statementCode,
  ownerName,
  ownerEmail,
  onConfirm,
}: SendStatementModalProps) {
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Send ${statementCode} to ${ownerName}?`}
      body={
        <>
          <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--ink-3)" }}>
            Email goes to <b style={{ color: "var(--ink)" }}>{ownerEmail}</b>.
            The Owner Portal will surface this statement once the message hits the inbox.
          </p>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
            Personal note (optional, appended to the system email)
          </label>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Hi Emma — March was a strong month. Let me know if anything looks off."
          />
        </>
      }
      confirmLabel="Send statement"
      onConfirm={async () => {
        await onConfirm?.(note.trim());
      }}
    />
  );
}
