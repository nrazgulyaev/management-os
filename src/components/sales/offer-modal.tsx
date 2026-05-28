"use client";

/**
 * Phase 2.4 dev-02 — OfferModal.
 *
 * Form modal that creates / counters an offer on a lead+unit.
 * Below-list amount triggers an approval gate (Critical UX rule
 * 2): if checkOfferPolicy() says approval needed, modal switches
 * the primary action to "Request approval".
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { checkOfferPolicy } from "@/features/sales/offer-policy";

export interface OfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  unitId: string;
  unitLabel: string;
  listPriceIdr: number;
  inlineDiscountTolerance?: number;
  onSubmit?: (values: {
    leadId: string;
    unitId: string;
    amountIdr: number;
    validUntil: string;
    needsApproval: boolean;
  }) => Promise<void> | void;
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function OfferModal({
  open,
  onOpenChange,
  leadId,
  unitId,
  unitLabel,
  listPriceIdr,
  inlineDiscountTolerance,
  onSubmit,
}: OfferModalProps) {
  const [amount, setAmount] = React.useState(listPriceIdr);
  const [validUntil, setValidUntil] = React.useState(plusDaysIso(7));

  React.useEffect(() => {
    if (!open) {
      setAmount(listPriceIdr);
      setValidUntil(plusDaysIso(7));
    }
  }, [open, listPriceIdr]);

  const outcome = checkOfferPolicy({ amountIdr: amount, listPriceIdr, inlineDiscountTolerance });
  const allowed = outcome.allowed;
  const needsApproval = allowed && outcome.autoApproved === false;
  const discountPct = 100 * (1 - amount / listPriceIdr);

  async function submit() {
    if (!allowed) return;
    await onSubmit?.({ leadId, unitId, amountIdr: amount, validUntil, needsApproval });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={amount !== listPriceIdr} ariaLabel="New offer">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
        glyphTone="accent"
        title={`Offer on ${unitLabel}`}
        description={`List ${fmt(listPriceIdr)} IDR · offer must stay positive.`}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Amount (IDR)</label>
          <input
            className="input"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="field-helper mono">
            {discountPct > 0 ? `${discountPct.toFixed(1)}% below list` : `${(-discountPct).toFixed(1)}% above list`}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Valid until</label>
          <input
            className="input"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            min={plusDaysIso(1)}
          />
        </div>
        {!allowed && outcome.allowed === false && (
          <div className="field-error mono">{outcome.reason}</div>
        )}
        {needsApproval && allowed && (
          <div className="field-warn mono">
            Below-list — needs {outcome.requiresApprovalBy} approval before send.
          </div>
        )}
      </ModalBody>
      <ModalFooter help="Approval gate triggers automatically below tolerance.">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!allowed} onClick={submit}>
          {needsApproval ? "Request approval" : "Send offer"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
