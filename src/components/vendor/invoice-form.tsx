"use client";

import { useActionState } from "react";
import { createVendorInvoiceAction } from "@/features/service-fulfilment/actions";

export function VendorInvoiceForm({
  fulfilmentId,
  vendorId,
  currency,
}: {
  fulfilmentId: string;
  vendorId: string;
  currency: string;
}) {
  const [state, dispatch] = useActionState(
    createVendorInvoiceAction,
    null,
  );
  return (
    <form
      action={dispatch}
      className="flex flex-col gap-3 rounded-md border border-line-soft bg-surface p-5"
    >
      <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="currency" value={currency} />
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Invoice number
        <input
          name="invoiceNumber"
          required
          className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Amount (minor units, {currency})
        <input
          name="amountMinor"
          type="number"
          required
          min={0}
          className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Invoice date
          <input
            name="invoiceDate"
            type="date"
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Due date
          <input
            name="dueDate"
            type="date"
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Notes
        <textarea
          name="notes"
          rows={3}
          className="px-3 py-2 rounded-md border border-line-soft bg-canvas text-sm text-ink"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Submit invoice
        </button>
        {state?.ok && (
          <span className="text-xs text-success">Invoice submitted.</span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
