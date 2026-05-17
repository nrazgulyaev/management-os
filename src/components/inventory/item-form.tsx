"use client";

import Link from "next/link";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createInventoryItemAction } from "@/features/inventory/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function InventoryItemForm({
  categories,
  suppliers,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  categories: Option[];
  suppliers: Option[];
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createInventoryItemAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (onSuccess) onSuccess();
      else if (state.redirectTo) router.push(state.redirectTo);
    }
  }, [state, router, onSuccess]);
  return (
    <form action={dispatch}>
      <FormShell
        title="New inventory item"
        description="Catalog SKU, default supplier, reorder thresholds."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            ) : (
              <Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button>
            )}
            <SubmitButton>Create item</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Name" required error={errs.name?.[0]}>
          <input name="name" required className={inputCls} placeholder="Bath towel · white · large" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU"><input name="sku" className={inputCls} placeholder="LIN-TOWEL-WH-L" /></Field>
          <Field label="Barcode"><input name="barcode" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Item type" required>
            <select name="itemType" defaultValue="consumable" className={selectCls}>
              <option value="consumable">Consumable</option>
              <option value="linen">Linen</option>
              <option value="towel">Towel</option>
              <option value="amenity">Amenity</option>
              <option value="chemical">Chemical</option>
              <option value="spare_part">Spare part</option>
              <option value="equipment">Equipment</option>
              <option value="furniture">Furniture</option>
              <option value="appliance">Appliance</option>
              <option value="tool">Tool</option>
            </select>
          </Field>
          <Field label="Unit"><input name="unit" defaultValue="pcs" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select name="categoryId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Default supplier">
            <select name="defaultSupplierId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Reorder point"><input type="number" min={0} step={0.001} name="reorderPoint" className={inputCls} /></Field>
          <Field label="Reorder qty"><input type="number" min={0} step={0.001} name="reorderQuantity" className={inputCls} /></Field>
          <Field label="Owner chargeable">
            <select name="ownerChargeable" defaultValue="true" className={selectCls}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Unit cost (minor)"><input type="number" min={0} name="unitCostMinor" className={inputCls} placeholder="USD 12.50 → 1250" /></Field>
          <Field label="Currency"><input name="currency" maxLength={3} className={inputCls + " uppercase"} placeholder="USD" /></Field>
          <Field label="Track serials">
            <select name="trackSerial" defaultValue="false" className={selectCls}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" rows={3} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
