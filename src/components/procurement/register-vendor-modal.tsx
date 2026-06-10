"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { validateNpwp, NPWP_FORMAT_HINT } from "@/lib/tax/npwp";

/**
 * Phase 2.2 dev-04 — RegisterVendorModal.
 *
 * Form-md. Contact + category + tax docs upload (single file —
 * NPWP for ID, EIN for US, GST for SG).
 */

export interface RegisterVendorValues {
  name: string;
  contactEmail: string;
  contactPhone: string;
  category: string;
  taxRegion: "ID" | "US" | "SG" | "OTHER";
  taxId: string;
  taxDocName: string | null;
}

export interface RegisterVendorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-defined category list (vendor_categories). */
  categories: string[];
  onSubmit?: (values: RegisterVendorValues) => Promise<void> | void;
}

const INITIAL: RegisterVendorValues = {
  name: "",
  contactEmail: "",
  contactPhone: "",
  category: "",
  taxRegion: "ID",
  taxId: "",
  taxDocName: null,
};

export function RegisterVendorModal({
  open,
  onOpenChange,
  categories,
  onSubmit,
}: RegisterVendorModalProps) {
  const [values, setValues] = React.useState<RegisterVendorValues>(INITIAL);

  React.useEffect(() => {
    if (!open) setValues(INITIAL);
  }, [open]);

  const dirty = values.name.length > 0 || values.contactEmail.length > 0;

  // ID-TAX — soft NPWP format check, Indonesia region only (US EIN / SG
  // GST values must not be judged against NPWP rules). Empty stays
  // allowed; a present-but-malformed value blocks submit inline.
  const npwpError =
    values.taxRegion === "ID" &&
    values.taxId.trim().length > 0 &&
    !validateNpwp(values.taxId).valid
      ? `Invalid NPWP format — enter a ${NPWP_FORMAT_HINT}, or leave blank.`
      : null;

  async function submit() {
    if (!values.name || !values.category || npwpError) return;
    await onSubmit?.(values);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Register vendor">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
          </svg>
        }
        glyphTone="accent"
        title="Register vendor"
        description="New vendors start unranked; the score updater runs nightly to compute a composite from PO history."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Vendor name</label>
          <input className="input" value={values.name} onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Contact email</label>
            <input className="input" type="email" value={values.contactEmail} onChange={(e) => setValues((p) => ({ ...p, contactEmail: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Phone</label>
            <input className="input" value={values.contactPhone} onChange={(e) => setValues((p) => ({ ...p, contactPhone: e.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Category</label>
          <select className="select" value={values.category} onChange={(e) => setValues((p) => ({ ...p, category: e.target.value }))}>
            <option value="">Pick a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Tax region</label>
            <select className="select" value={values.taxRegion} onChange={(e) => setValues((p) => ({ ...p, taxRegion: e.target.value as RegisterVendorValues["taxRegion"] }))}>
              <option value="ID">Indonesia (NPWP)</option>
              <option value="US">United States (EIN)</option>
              <option value="SG">Singapore (GST)</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Tax ID</label>
            <input
              className="input mono"
              value={values.taxId}
              aria-invalid={npwpError !== null || undefined}
              data-testid="npwp-input"
              onChange={(e) => setValues((p) => ({ ...p, taxId: e.target.value }))}
            />
            {npwpError && (
              <span className="text-xs text-danger" data-testid="npwp-error">
                {npwpError}
              </span>
            )}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Tax document (PDF)</label>
          <input
            type="file"
            className="input"
            accept=".pdf"
            onChange={(e) => setValues((p) => ({ ...p, taxDocName: e.target.files?.[0]?.name ?? null }))}
          />
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to save">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={!values.name || !values.category || npwpError !== null}
        >
          Register vendor
        </button>
      </ModalFooter>
    </Modal>
  );
}
