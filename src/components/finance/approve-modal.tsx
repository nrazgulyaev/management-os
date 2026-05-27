"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-02 — ApproveStatementModal.
 *
 * Confirm-sm. **Default focus = Cancel** (per spec — Director
 * confirms a permanent state change). When the statement has
 * flagged anomalies, the Approve button stays disabled until the
 * acknowledgement checkbox is ticked.
 *
 * Hand-rolled vs ConfirmModal because the default-focus rules + the
 * inline checkbox block don't fit the shared confirm primitive
 * cleanly.
 */

export interface ApproveStatementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statementCode: string;
  netToOwner: string;
  anomalyCount?: number;
  onConfirm?: () => Promise<void> | void;
}

export function ApproveStatementModal({
  open,
  onOpenChange,
  statementCode,
  netToOwner,
  anomalyCount = 0,
  onConfirm,
}: ApproveStatementModalProps) {
  const [ackAnomalies, setAckAnomalies] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setAckAnomalies(false);
      setBusy(false);
    }
  }, [open]);

  const blocked = anomalyCount > 0 && !ackAnomalies;

  async function confirm() {
    if (blocked || busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal sm confirm"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <ModalHeader
            glyph={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
            glyphTone="ok"
            title={`Approve ${statementCode}?`}
            description={
              <>
                Net to owner: <b style={{ color: "var(--ink)" }}>{netToOwner}</b>.
                Approval seals the hash and unlocks the "Send to owner" step.
              </>
            }
          />
          <ModalBody>
            {anomalyCount > 0 && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={ackAnomalies}
                  onChange={(e) => setAckAnomalies(e.target.checked)}
                />
                <span>
                  I&apos;ve reviewed the <b>{anomalyCount} flagged anomal{anomalyCount === 1 ? "y" : "ies"}</b>{" "}
                  and approve them with the statement.
                </span>
              </label>
            )}
          </ModalBody>
          <ModalFooter>
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={confirm}
              disabled={blocked || busy}
            >
              {busy ? "Approving…" : "Approve & seal hash"}
            </button>
          </ModalFooter>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
