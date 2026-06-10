"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { NpwpInput } from "@/components/development/finance/npwp-input";
import { createVendor } from "@/lib/development/server/vendor-actions";
import { validateNpwp, NPWP_FORMAT_HINT } from "@/lib/tax/npwp";

/**
 * Stage 6.P0.4 — modal-driven Add Vendor.
 *
 * Vendor-types reflect the construction/development domain (contractors,
 * consultants, government bodies, suppliers). The bookkeeper picks
 * type at create-time; downstream invoice/PO flows use the type to
 * filter vendor lists.
 *
 * Workflow-verb label: "Add vendor".
 */

const VENDOR_TYPES = [
  { value: "contractor", label: "Contractor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "supplier", label: "Supplier (materials)" },
  { value: "consultant", label: "Consultant" },
  { value: "professional_service", label: "Professional service (legal / accounting)" },
  { value: "government_body", label: "Government body" },
  { value: "utility", label: "Utility provider" },
  { value: "other", label: "Other" },
] as const;

export function VendorModalForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const vendorCode = String(formData.get("vendorCode") ?? "").trim();
    const legalName = String(formData.get("legalName") ?? "").trim();
    const vendorType = String(formData.get("vendorType") ?? "");
    const legalEntityType = String(formData.get("legalEntityType") ?? "").trim();
    const primaryEmail = String(formData.get("primaryEmail") ?? "").trim();
    const primaryPhone = String(formData.get("primaryPhone") ?? "").trim();
    const whatsappPhone = String(formData.get("whatsappPhone") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const taxId = String(formData.get("taxId") ?? "").trim();
    const businessLicenseNumber = String(
      formData.get("businessLicenseNumber") ?? "",
    ).trim();
    const businessLicenseExpiry = String(
      formData.get("businessLicenseExpiry") ?? "",
    ).trim();
    const bankName = String(formData.get("bankName") ?? "").trim();
    const bankAccountHolder = String(
      formData.get("bankAccountHolder") ?? "",
    ).trim();
    const bankAccountNumber = String(
      formData.get("bankAccountNumber") ?? "",
    ).trim();
    const bankSwift = String(formData.get("bankSwift") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    // ID-TAX — soft NPWP format check (NpwpInput already blocks native
    // submit via setCustomValidity; this is the belt-and-braces guard).
    // Empty stays allowed: NPWP is optional.
    if (taxId && !validateNpwp(taxId).valid) {
      setError(
        `Invalid NPWP format — enter a ${NPWP_FORMAT_HINT}, or leave blank.`,
      );
      return;
    }

    startTransition(async () => {
      try {
        await createVendor({
          vendorCode,
          legalName,
          vendorType: vendorType as never,
          legalEntityType: legalEntityType || null,
          primaryEmail: primaryEmail || null,
          primaryPhone: primaryPhone || null,
          whatsappPhone: whatsappPhone || null,
          address: address || null,
          taxId: taxId || null,
          businessLicenseNumber: businessLicenseNumber || null,
          businessLicenseExpiry: businessLicenseExpiry || null,
          bankName: bankName || null,
          bankAccountHolder: bankAccountHolder || null,
          bankAccountNumber: bankAccountNumber || null,
          bankSwift: bankSwift || null,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add vendor");
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        data-testid="vendor-add-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add vendor
      </Button>

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Add vendor"
        description="Vendors invoice the company; engagements link them to specific projects + scopes."
        size="lg"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Vendor code" required hint="Stable short identifier">
              <input
                name="vendorCode"
                required
                placeholder="ACME_CONSTRUCTION"
                className={inputCls}
              />
            </Field>
            <Field label="Legal name" required>
              <input
                name="legalName"
                required
                placeholder="PT ACME Construction Indonesia"
                className={inputCls}
              />
            </Field>
            <Field label="Vendor type" required>
              <select name="vendorType" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select type…
                </option>
                {VENDOR_TYPES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Legal entity type" hint="PT, CV, individual, etc.">
              <input
                name="legalEntityType"
                placeholder="PT PMA"
                className={inputCls}
              />
            </Field>
          </div>

          <details className="rounded-sm border border-line-soft p-3" open>
            <summary className="text-sm text-ink-secondary cursor-pointer select-none">
              Contact
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
              <Field label="Primary email">
                <input
                  name="primaryEmail"
                  type="email"
                  inputMode="email"
                  className={inputCls}
                />
              </Field>
              <Field label="Primary phone">
                <input
                  name="primaryPhone"
                  type="tel"
                  inputMode="tel"
                  className={inputCls}
                />
              </Field>
              <Field label="WhatsApp phone" hint="E.164 format, e.g. +6281234567890">
                <input
                  name="whatsappPhone"
                  type="tel"
                  inputMode="tel"
                  className={inputCls}
                />
              </Field>
              <Field label="Address">
                <input name="address" className={inputCls} />
              </Field>
            </div>
          </details>

          <details className="rounded-sm border border-line-soft p-3">
            <summary className="text-sm text-ink-secondary cursor-pointer select-none">
              Compliance + tax
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
              <Field
                label="Tax ID (NPWP / TIN)"
                hint="Optional · 15-digit NPWP or 16-digit NIK format"
              >
                <NpwpInput name="taxId" className={inputCls} />
              </Field>
              <Field label="Business licence number">
                <input name="businessLicenseNumber" className={inputCls} />
              </Field>
              <Field label="Business licence expiry">
                <input
                  name="businessLicenseExpiry"
                  type="date"
                  className={inputCls}
                />
              </Field>
            </div>
          </details>

          <details className="rounded-sm border border-line-soft p-3">
            <summary className="text-sm text-ink-secondary cursor-pointer select-none">
              Bank details (for paying this vendor)
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
              <Field label="Bank name">
                <input name="bankName" className={inputCls} />
              </Field>
              <Field label="Account holder">
                <input name="bankAccountHolder" className={inputCls} />
              </Field>
              <Field label="Account number">
                <input name="bankAccountNumber" className={inputCls} />
              </Field>
              <Field label="SWIFT / BIC">
                <input name="bankSwift" className={inputCls} />
              </Field>
            </div>
          </details>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              className={textareaCls}
              placeholder="Anything relevant"
            />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Adding…">
              Add vendor
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
