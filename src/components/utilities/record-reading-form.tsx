"use client";

import { useActionState } from "react";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { recordUtilityReadingAction } from "@/features/utilities/actions";

const TYPES = ["meter", "token_balance", "bill_amount", "manual_check"] as const;
const SOURCES = ["manual", "field_check", "import", "api"] as const;

export function RecordReadingForm({
  accountId,
  tokenMeter,
  currency,
}: {
  accountId: string;
  tokenMeter: boolean;
  currency: string;
}) {
  const [state, dispatch] = useActionState(recordUtilityReadingAction, null);
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
              <span className="text-xs text-ink-tertiary mr-auto">
                Recorded · risk: {state.riskLevel}
              </span>
            )}
            <SubmitButton>Record reading</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Reading type" required>
            <select
              name="readingType"
              required
              className={selectCls}
              defaultValue={tokenMeter ? "token_balance" : "meter"}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reading value (units)">
            <input type="number" step="0.01" name="readingValue" className={inputCls} />
          </Field>
          <Field label="Balance (minor units)">
            <input type="number" name="balanceMinor" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Reading at (ISO datetime)">
            <input type="datetime-local" name="readingAt" className={inputCls} />
          </Field>
          <Field label="Source">
            <select name="source" className={selectCls} defaultValue="field_check">
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea name="notes" rows={2} maxLength={500} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
