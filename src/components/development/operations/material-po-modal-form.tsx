"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createMaterialPO } from "@/lib/development/server/material-actions";

/**
 * Stage 6.P0.6 — Create Material PO modal (Tier 4).
 *
 * Scope: single-line PO. Multi-line POs continue to use the existing
 * /materials/new full-page form. This modal handles the common case
 * (one material, single PO) for the bookkeeper's quick-create flow.
 *
 * Workflow verb: "Create material PO".
 */

const CURRENCIES = ["USD", "IDR", "RUB", "EUR", "USDT", "CNY"] as const;

export interface ProjectOption {
  id: string;
  name: string;
}

export interface VendorOption {
  id: string;
  vendorCode: string;
  legalName: string;
}

export function MaterialPOModalForm({
  projects,
  vendors,
}: {
  projects: ProjectOption[];
  vendors: VendorOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const poCode = String(formData.get("poCode") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "");
    const vendorId = String(formData.get("vendorId") ?? "");
    const orderDate = String(formData.get("orderDate") ?? "");
    const expectedDeliveryDate = String(formData.get("expectedDeliveryDate") ?? "");
    const currency = String(formData.get("totalAmountCurrency") ?? "");
    const fxRate = String(formData.get("fxRateAtOrder") ?? "1.0");
    const notes = String(formData.get("notes") ?? "").trim();

    const materialName = String(formData.get("materialName") ?? "").trim();
    const unitOfMeasure = String(formData.get("unitOfMeasure") ?? "").trim();
    const quantityRaw = Number(formData.get("quantityOrdered") ?? "0");
    const unitPriceMajor = Number(formData.get("unitPriceMajor") ?? "0");
    const unitPriceUsdMajor = Number(formData.get("unitPriceUsdMajor") ?? "0");

    if (!isFinite(quantityRaw) || quantityRaw <= 0) {
      setError("Quantity must be positive");
      return;
    }
    if (!isFinite(unitPriceMajor) || unitPriceMajor <= 0) {
      setError("Unit price must be positive");
      return;
    }

    startTransition(async () => {
      try {
        await createMaterialPO({
          poCode,
          projectId,
          vendorId,
          orderDate,
          expectedDeliveryDate: expectedDeliveryDate || null,
          totalAmountCurrency: currency as never,
          fxRateAtOrder: fxRate,
          notes: notes || null,
          lines: [
            {
              lineNumber: 1,
              materialName,
              unitOfMeasure,
              quantityOrdered: quantityRaw,
              unitPriceUsdMinor: BigInt(Math.round(unitPriceUsdMajor * 100)),
              unitPriceOriginalMinor: BigInt(Math.round(unitPriceMajor * 100)),
            },
          ],
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create PO");
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="material-po-create-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Create material PO
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Create material PO"
        description="Single-line quick PO. Use the full form for multi-line orders."
        size="lg"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="PO code" required hint="Stable short identifier">
              <input
                name="poCode"
                required
                pattern="[A-Za-z0-9_-]+"
                placeholder="PO-2026-001"
                className={inputCls}
              />
            </Field>
            <Field label="Project" required>
              <select name="projectId" required className={selectCls} defaultValue="">
                <option value="" disabled>Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Vendor" required>
              <select name="vendorId" required className={selectCls} defaultValue="">
                <option value="" disabled>Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.legalName} ({v.vendorCode})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order date" required>
              <input
                name="orderDate"
                type="date"
                required
                defaultValue={today}
                className={inputCls}
              />
            </Field>
            <Field label="Expected delivery date">
              <input name="expectedDeliveryDate" type="date" className={inputCls} />
            </Field>
            <Field label="Currency" required>
              <select name="totalAmountCurrency" required className={selectCls} defaultValue="">
                <option value="" disabled>Select…</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="FX rate at order" hint="Source → USD; 1.0 for USD POs">
              <input
                name="fxRateAtOrder"
                pattern="^\d+(\.\d+)?$"
                defaultValue="1.0"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="rounded-sm border border-line-soft p-3 bg-muted/20">
            <p className="text-xs text-ink-tertiary uppercase tracking-wide mb-3">
              Line item
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Material name" required>
                <input
                  name="materialName"
                  required
                  placeholder="Portland cement"
                  className={inputCls}
                />
              </Field>
              <Field label="Unit of measure" required hint="bag, m³, kg, pcs…">
                <input name="unitOfMeasure" required placeholder="bag" className={inputCls} />
              </Field>
              <Field label="Quantity ordered" required>
                <input
                  name="quantityOrdered"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Unit price (in PO currency)" required>
                <input
                  name="unitPriceMajor"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Unit price (USD)" required hint="For USD-equivalent reporting">
                <input
                  name="unitPriceUsdMajor"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Creating…">
              Create material PO
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
