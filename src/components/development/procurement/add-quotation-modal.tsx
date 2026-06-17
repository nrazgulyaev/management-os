"use client";

/**
 * "Add quotation" modal for the purchase-request detail page.
 *
 * Captures a vendor + total + currency (and optional quote metadata) and
 * persists through the org-scoped, audited `addQuotation` server action.
 * Adding the first quotation also bumps the PR from `approved` →
 * `quotations_in_progress` (handled server-side).
 *
 * Money is entered in major units and converted to bigint MINOR units
 * (× 100) before the action call — no float math is persisted.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { addQuotation } from "@/lib/development/server/procurement/procurement-actions";

const CURRENCIES = ["IDR", "USD", "EUR", "RUB", "USDT", "CNY"] as const;

export interface QuotationVendorOption {
  id: string;
  vendorCode: string;
  legalName: string;
}

export function AddQuotationModal({
  purchaseRequestId,
  vendors,
}: {
  purchaseRequestId: string;
  vendors: QuotationVendorOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const vendorId = String(formData.get("vendorId") ?? "");
    const totalMajor = Number(formData.get("totalMajor") ?? "0");
    const currency = String(formData.get("currency") ?? "IDR");
    const quotationNumber = String(formData.get("quotationNumber") ?? "").trim();
    const validityUntil = String(formData.get("validityUntil") ?? "").trim();
    const paymentTerms = String(formData.get("paymentTerms") ?? "").trim();
    const deliveryEstimatedDate = String(
      formData.get("deliveryEstimatedDate") ?? "",
    ).trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!vendorId) {
      setError("Select a vendor.");
      return;
    }
    if (!isFinite(totalMajor) || totalMajor <= 0) {
      setError("Total amount must be positive.");
      return;
    }

    startTransition(async () => {
      try {
        await addQuotation({
          purchaseRequestId,
          vendorId,
          totalAmountMinor: BigInt(Math.round(totalMajor * 100)),
          currency,
          quotationNumber: quotationNumber || undefined,
          validityUntil: validityUntil || undefined,
          paymentTerms: paymentTerms || undefined,
          deliveryEstimatedDate: deliveryEstimatedDate || undefined,
          notes: notes || undefined,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add quotation");
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="add-quotation-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add quotation
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Add quotation"
        description="Record a vendor quote against this purchase request."
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
            <div className="md:col-span-2">
              <Field label="Vendor" required>
                <select name="vendorId" required defaultValue="" className={selectCls}>
                  <option value="" disabled>
                    Select vendor…
                  </option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.legalName} ({v.vendorCode})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Total amount" required hint="In the quote currency">
              <input
                name="totalMajor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                className={inputCls}
              />
            </Field>
            <Field label="Currency" required>
              <select name="currency" required defaultValue="IDR" className={selectCls}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quote number">
              <input name="quotationNumber" className={inputCls} placeholder="Q-2026-001" />
            </Field>
            <Field label="Valid until">
              <input name="validityUntil" type="date" className={inputCls} />
            </Field>
            <Field label="Payment terms">
              <input name="paymentTerms" className={inputCls} placeholder="30% deposit, net 30" />
            </Field>
            <Field label="Estimated delivery">
              <input name="deliveryEstimatedDate" type="date" className={inputCls} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Saving…">
              Add quotation
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
