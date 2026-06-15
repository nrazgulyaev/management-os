"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createPayoutLineAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface PayoutLineFormOption {
  id: string;
  label: string;
}

/**
 * Create an individual owner payout line (the unit that schedules an actual
 * wire). Backed by `createPayoutLineAction` (perm `finance.approve_payout`,
 * org-scoped). The line can be left unbatched or attached to an existing
 * payout batch. Follows the Modal-First contract (`onSuccess`/`onCancel`).
 */
export function PayoutLineForm({
  owners,
  batches,
  onSuccess,
  onCancel,
}: {
  owners: PayoutLineFormOption[];
  batches: PayoutLineFormOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    createPayoutLineAction,
    { onSuccess },
  );
  const [currency, setCurrency] = useState("USD");
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form action={submitAction}>
      <FormShell
        title="Payout line"
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/dashboard/finance/payouts">Cancel</Link>
              </Button>
            )}
            <SubmitButton>Create line</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Owner" required error={errs.ownerId?.[0]}>
          <select name="ownerId" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              Select owner…
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MoneyInput
            label="Amount"
            name="amountMinor"
            required
            currency={currency}
            error={errs.amountMinor?.[0]}
          />
          <Field label="Currency" required error={errs.currency?.[0]}>
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
          <Field
            label="Batch"
            error={errs.payoutBatchId?.[0]}
            hint="Attach to an existing payout batch, or leave unbatched."
          >
            <select name="payoutBatchId" defaultValue="" className={selectCls}>
              <option value="">— Unbatched —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Wire date" error={errs.scheduledFor?.[0]} hint="When the wire is scheduled to send.">
            <input type="date" name="scheduledFor" className={inputCls} />
          </Field>
        </div>

        <Field label="Reference" error={errs.reference?.[0]} hint="Bank reference / memo (optional).">
          <input name="reference" className={inputCls} placeholder="e.g. WIRE-2026-04-OWNER" />
        </Field>
      </FormShell>
    </form>
  );
}
