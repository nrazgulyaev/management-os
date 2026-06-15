"use client";

import { useState } from "react";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { addPurchaseRequestLineAction } from "@/features/procurement/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface ItemOption {
  id: string;
  label: string;
}

/**
 * Append a line to a purchase request. Backed by `addPurchaseRequestLineAction`
 * (perm `procurement.write`, org-scoped) which also recomputes the request's
 * estimated total. Follows the Modal-First contract (`onSuccess`/`onCancel`).
 */
export function PurchaseRequestLineForm({
  requestId,
  items,
  currency = "USD",
  onSuccess,
  onCancel,
}: {
  requestId: string;
  items: ItemOption[];
  currency?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    addPurchaseRequestLineAction,
    { onSuccess },
  );
  const [cur, setCur] = useState(currency);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form action={submitAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <FormShell
        title="Add line"
        footer={
          <>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            )}
            <SubmitButton>Add line</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Description" required error={errs.description?.[0]}>
          <input name="description" required className={inputCls} placeholder="e.g. King mattress" />
        </Field>

        {items.length > 0 && (
          <Field
            label="Inventory item"
            error={errs.itemId?.[0]}
            hint="Optional — link to a catalogued SKU."
          >
            <select name="itemId" defaultValue="" className={selectCls}>
              <option value="">— None —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Quantity" required error={errs.quantity?.[0]}>
            <input
              name="quantity"
              type="number"
              min={0.001}
              step={0.001}
              required
              defaultValue="1"
              className={inputCls}
            />
          </Field>
          <Field label="Unit" error={errs.unit?.[0]}>
            <input name="unit" defaultValue="pcs" className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MoneyInput
            label="Est. unit cost"
            name="estimatedUnitCostMinor"
            currency={cur}
            error={errs.estimatedUnitCostMinor?.[0]}
          />
          <Field label="Currency" error={errs.currency?.[0]}>
            <select
              name="currency"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              className={selectCls}
            >
              {["USD", "IDR", "EUR", "GBP", "AUD", "SGD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
