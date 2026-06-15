"use client";

import { useState } from "react";
import {
  Field,
  FormShell,
  inputCls,
  selectCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { attachVendorToServiceAction } from "@/features/service-fulfilment/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface AttachServiceOption {
  id: string;
  label: string;
}

/**
 * Map a guest service into a vendor's catalogue. Backed by
 * `attachVendorToServiceAction` (perm `service_vendor.write`, org-scoped).
 * Posts the exact `attachVendorToServiceSchema` fields: `vendorId` (hidden),
 * `serviceId`, optional `baseCostMinor` (BIGINT minor), `currency`,
 * `leadTimeMinutes`, `minNoticeMinutes`, `notes`. Re-attaching an existing
 * (vendor, service) pair re-activates + updates it.
 */
export function AttachVendorServiceForm({
  vendorId,
  services,
  defaultCurrency = "USD",
  onSuccess,
  onCancel,
}: {
  vendorId: string;
  services: AttachServiceOption[];
  defaultCurrency?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    attachVendorToServiceAction,
    { onSuccess },
  );
  const [currency, setCurrency] = useState(defaultCurrency);

  return (
    <form action={submitAction}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <FormShell
        title="Map service"
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
            <SubmitButton>Map service</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Service" required>
          <select name="serviceId" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              Select service…
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MoneyInput
            label="Base cost (optional)"
            name="baseCostMinor"
            currency={currency}
            hint="Default cost this vendor charges for the service."
          />
          <Field label="Currency">
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Lead time (minutes)" hint="Typical time to deliver after dispatch.">
            <input
              type="number"
              name="leadTimeMinutes"
              min={0}
              max={100000}
              className={inputCls}
              placeholder="e.g. 60"
            />
          </Field>
          <Field
            label="Min notice (minutes)"
            hint="Minimum lead the vendor needs before a booking."
          >
            <input
              type="number"
              name="minNoticeMinutes"
              min={0}
              max={100000}
              className={inputCls}
              placeholder="e.g. 120"
            />
          </Field>
        </div>

        <Field label="Notes">
          <input
            name="notes"
            className={inputCls}
            placeholder="Internal notes about this vendor↔service mapping (optional)"
          />
        </Field>
      </FormShell>
    </form>
  );
}
