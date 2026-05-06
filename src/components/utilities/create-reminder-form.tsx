"use client";

import { useActionState } from "react";
import {
  FormShell,
  Field,
  inputCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { createUtilityPaymentReminderAction } from "@/features/utilities/actions";

export function CreateReminderForm({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const [state, dispatch] = useActionState(
    createUtilityPaymentReminderAction,
    null,
  );
  return (
    <form action={dispatch}>
      <input type="hidden" name="utilityAccountId" value={accountId} />
      <input type="hidden" name="currency" value={currency} />
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            {state && state.ok && (
              <span className="text-xs text-ink-tertiary mr-auto">Reminder created.</span>
            )}
            <SubmitButton>Add reminder</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Due date" required>
            <input type="date" name="dueDate" required className={inputCls} />
          </Field>
          <Field label="Amount (minor units)">
            <input type="number" name="amountMinor" min={0} className={inputCls} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea name="notes" rows={2} maxLength={500} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
