"use client";

import { useActionState } from "react";
import { createVendorInvoiceFromTokenAction } from "@/features/service-fulfilment/actions";

export function VendorInvoiceForm({
  token,
  currency,
}: {
  token: string;
  currency: string;
}) {
  const [state, dispatch] = useActionState(
    createVendorInvoiceFromTokenAction,
    null,
  );
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-success/40 bg-success/5 p-5">
        <span className="text-[11px] uppercase tracking-widest text-success">
          Submitted
        </span>
        <p className="text-sm text-ink">
          Your invoice has been received.{" "}
          {state.invoiceNumber ? (
            <>
              Reference{" "}
              <span className="font-mono text-ink">{state.invoiceNumber}</span>.
            </>
          ) : (
            <>It is now queued for review by our finance team.</>
          )}
        </p>
        <p className="text-xs text-ink-tertiary">
          Keep this page for your records — payouts are settled separately once
          the invoice is approved.
        </p>
      </div>
    );
  }
  return (
    <form
      action={dispatch}
      className="flex flex-col gap-3 rounded-md border border-line-soft bg-surface p-5"
    >
      <input type="hidden" name="token" value={token} />
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
        Invoice document (PDF or image, optional, max 25 MB)
        <input
          name="document"
          type="file"
          accept="application/pdf,image/*"
          className="text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:text-ink-inverse hover:file:bg-ink/90"
        />
      </label>
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
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
