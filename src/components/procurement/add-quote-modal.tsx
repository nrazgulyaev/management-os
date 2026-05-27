"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 dev-04 — AddQuoteModal.
 *
 * Form-md. PDF upload → quote-parser agent extracts a parsed
 * preview (lines + total + lead time). Procurement reviews/edits
 * before commit.
 */

export interface AddQuoteValues {
  rfqId: string;
  vendorId: string;
  totalUsd: number;
  leadTimeDays: number;
  warrantyMonths: number;
  parsedSourcePdfName: string | null;
}

export interface AddQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfqId: string;
  vendors: { id: string; name: string }[];
  onSubmit?: (values: AddQuoteValues) => Promise<void> | void;
}

export function AddQuoteModal({ open, onOpenChange, rfqId, vendors, onSubmit }: AddQuoteModalProps) {
  const [vendorId, setVendorId] = React.useState("");
  const [totalUsd, setTotalUsd] = React.useState(0);
  const [leadTime, setLeadTime] = React.useState(0);
  const [warranty, setWarranty] = React.useState(12);
  const [filename, setFilename] = React.useState<string | null>(null);
  const [parsing, setParsing] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setVendorId("");
      setTotalUsd(0);
      setLeadTime(0);
      setWarranty(12);
      setFilename(null);
      setParsing(false);
    }
  }, [open]);

  async function parsePdf(name: string) {
    setParsing(true);
    // PR 2.2 dev-04 stub — quote-parser agent fires here in 2.2 data.
    await new Promise((r) => setTimeout(r, 400));
    setTotalUsd(180_000);
    setLeadTime(28);
    setWarranty(12);
    setFilename(name);
    setParsing(false);
  }

  const dirty = vendorId !== "" || totalUsd > 0;

  async function submit() {
    if (!vendorId || totalUsd <= 0) return;
    await onSubmit?.({
      rfqId,
      vendorId,
      totalUsd,
      leadTimeDays: leadTime,
      warrantyMonths: warranty,
      parsedSourcePdfName: filename,
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Add quote">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        }
        glyphTone="accent"
        title="Add quote"
        description={`Upload the vendor PDF; the quote-parser agent pre-fills the fields. RFQ ${rfqId}`}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Vendor</label>
          <select className="select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Pick a vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Quote PDF</label>
          <input
            type="file"
            accept=".pdf"
            className="input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void parsePdf(f.name);
            }}
          />
          {parsing && <div className="field-help">Parsing… quote-parser agent extracting line totals.</div>}
          {filename && !parsing && (
            <div className="field-help">Pre-filled from <b>{filename}</b>. Edit below if anything looks off.</div>
          )}
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Total (USD)</label>
            <input className="input mono" type="number" value={totalUsd} onChange={(e) => setTotalUsd(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="field-label">Lead time (days)</label>
            <input className="input mono" type="number" value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Warranty (months)</label>
          <input className="input mono" type="number" value={warranty} onChange={(e) => setWarranty(Number(e.target.value))} />
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to save">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!vendorId || totalUsd <= 0}>
          Add quote
        </button>
      </ModalFooter>
    </Modal>
  );
}
