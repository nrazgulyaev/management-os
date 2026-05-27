"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-01 — ExtendStayModal.
 *
 * Form-sm. New checkout date + auto-computed extra-night charges.
 */

export interface ExtendStayValues {
  bookingId: string;
  newCheckOut: string;
  extraNightsRate: number;
}

export interface ExtendStayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: { id: string; code: string; checkOut: string; nightlyRateUsd: number } | null;
  onSubmit?: (values: ExtendStayValues) => Promise<void> | void;
}

export function ExtendStayModal({ open, onOpenChange, booking, onSubmit }: ExtendStayModalProps) {
  const [newCheckOut, setNewCheckOut] = React.useState("");

  React.useEffect(() => {
    if (open && booking) setNewCheckOut(booking.checkOut);
  }, [open, booking]);

  const extraNights = booking
    ? Math.max(
        0,
        Math.ceil(
          (new Date(newCheckOut).getTime() - new Date(booking.checkOut).getTime()) / 86_400_000,
        ),
      )
    : 0;
  const extraCost = extraNights * (booking?.nightlyRateUsd ?? 0);
  const dirty = booking ? newCheckOut !== booking.checkOut : false;

  async function submit() {
    if (!booking || !dirty) return;
    await onSubmit?.({
      bookingId: booking.id,
      newCheckOut,
      extraNightsRate: booking.nightlyRateUsd,
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" dirty={dirty} ariaLabel="Extend stay">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
          </svg>
        }
        glyphTone="accent"
        title="Extend stay"
        description={booking ? `${booking.code} · currently checking out ${booking.checkOut}` : ""}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">New check-out</label>
          <input
            className="input"
            type="date"
            value={newCheckOut}
            onChange={(e) => setNewCheckOut(e.target.value)}
            min={booking?.checkOut}
          />
        </div>
        {extraNights > 0 && (
          <div className="field-help" style={{ marginTop: 8 }}>
            +{extraNights} night{extraNights === 1 ? "" : "s"} ·{" "}
            <b style={{ color: "var(--ink)" }}>${extraCost.toLocaleString()}</b> at current rate
          </div>
        )}
      </ModalBody>
      <ModalFooter help="⌘ + Enter to save">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!dirty}>
          Extend by {extraNights} night{extraNights === 1 ? "" : "s"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
