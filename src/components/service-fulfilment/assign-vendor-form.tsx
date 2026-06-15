"use client";

import { useState } from "react";
import { Field, FormShell, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { assignFulfilmentVendorAction } from "@/features/service-fulfilment/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface VendorOption {
  id: string;
  label: string;
  defaultCurrency?: string;
}

/**
 * Assign a vendor to a fulfilment. Backed by `assignFulfilmentVendorAction`
 * (perm `service_fulfilment.dispatch`, org-scoped). Posts the exact
 * `assignFulfilmentVendorSchema` fields: `id` (fulfilment id, hidden),
 * `vendorId`, optional `vendorQuoteMinor` (BIGINT minor) and `fulfilmentType`.
 * The action flips the fulfilment to `awaiting_vendor`.
 */
export function AssignVendorForm({
  fulfilmentId,
  vendors,
  onSuccess,
  onCancel,
}: {
  fulfilmentId: string;
  vendors: VendorOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    assignFulfilmentVendorAction,
    { onSuccess },
  );
  const [vendorId, setVendorId] = useState("");
  const currency =
    vendors.find((v) => v.id === vendorId)?.defaultCurrency ?? "USD";

  return (
    <form action={submitAction}>
      <input type="hidden" name="id" value={fulfilmentId} />
      <FormShell
        title="Assign vendor"
        footer={
          <>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={pending}
              >
                Cancel
              </Button>
            )}
            <SubmitButton>Assign vendor</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Vendor" required>
          <select
            name="vendorId"
            required
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className={selectCls}
          >
            <option value="" disabled>
              Select vendor…
            </option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <MoneyInput
          label="Vendor quote (optional)"
          name="vendorQuoteMinor"
          currency={currency}
          hint="Agreed cost the vendor will charge. Leave blank if not yet quoted."
        />

        <Field
          label="Fulfilment type"
          hint="How this service is delivered. Defaults to vendor on assignment."
        >
          <select name="fulfilmentType" defaultValue="vendor" className={selectCls}>
            <option value="vendor">Vendor</option>
            <option value="hybrid">Hybrid</option>
            <option value="internal">Internal</option>
          </select>
        </Field>
      </FormShell>
    </form>
  );
}
