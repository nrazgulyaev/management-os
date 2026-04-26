"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createPayoutBatchAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

export function PayoutBatchForm() {
  const [state, dispatch] = useActionState(createPayoutBatchAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={dispatch}>
      <FormShell
        title="Batch details"
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/finance/payouts">Cancel</Link>
            </Button>
            <SubmitButton>Create batch</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Batch code" required error={errs.batchCode?.[0]}>
          <input name="batchCode" required className={inputCls} placeholder="PAYOUT-2026-04" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Period start" required error={errs.periodStart?.[0]}>
            <input name="periodStart" type="date" required className={inputCls} />
          </Field>
          <Field label="Period end" required error={errs.periodEnd?.[0]}>
            <input name="periodEnd" type="date" required className={inputCls} />
          </Field>
          <Field label="Currency" required error={errs.currency?.[0]}>
            <select name="currency" defaultValue="USD" className={selectCls}>
              {["USD", "IDR", "EUR", "GBP"].map((c) => (
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
