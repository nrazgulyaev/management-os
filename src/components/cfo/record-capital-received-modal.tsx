"use client";

/**
 * Phase 2.2 dev-02 — RecordCapitalReceivedModal.
 *
 * Form-md. Wire ref + received date + amount confirmation. Wires
 * to `capital_call_allocations.received_at` in the data PR.
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

export interface RecordReceivedValues {
  allocationId: string;
  wireRef: string;
  receivedAt: string;
  receivedUsd: number;
}

export interface RecordReceivedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocation: {
    id: string;
    investorName: string;
    expectedUsd: number;
  } | null;
  onSubmit?: (values: RecordReceivedValues) => Promise<void> | void;
}

export function RecordCapitalReceivedModal({
  open,
  onOpenChange,
  allocation,
  onSubmit,
}: RecordReceivedModalProps) {
  const [wireRef, setWireRef] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState("");
  const [receivedUsd, setReceivedUsd] = React.useState(0);

  React.useEffect(() => {
    if (open && allocation) {
      setReceivedUsd(allocation.expectedUsd);
      setReceivedAt(new Date().toISOString().slice(0, 10));
      setWireRef("");
    }
  }, [open, allocation]);

  const dirty = wireRef.length > 0;

  async function submit() {
    if (!allocation || !wireRef || !receivedAt) return;
    await onSubmit?.({
      allocationId: allocation.id,
      wireRef,
      receivedAt,
      receivedUsd,
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Record capital received">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
        glyphTone="ok"
        title="Record received"
        description={allocation ? `${allocation.investorName} · expected $${allocation.expectedUsd.toLocaleString()}` : ""}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Wire reference</label>
          <input
            className="input mono"
            value={wireRef}
            onChange={(e) => setWireRef(e.target.value)}
            placeholder="MT103-2026-…"
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Received date</label>
            <input
              className="input"
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Amount received (USD)</label>
            <input
              className="input mono"
              type="number"
              value={receivedUsd}
              onChange={(e) => setReceivedUsd(Number(e.target.value))}
            />
          </div>
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to record">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={!wireRef || !receivedAt || receivedUsd <= 0}
        >
          Record receipt
        </button>
      </ModalFooter>
    </Modal>
  );
}
