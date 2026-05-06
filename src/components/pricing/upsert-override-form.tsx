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
import { upsertRatePlanOverrideAction } from "@/features/pricing/actions";

export function UpsertOverrideForm({ ratePlanId }: { ratePlanId: string }) {
  const [state, dispatch] = useActionState(upsertRatePlanOverrideAction, null);
  return (
    <form action={dispatch}>
      <input type="hidden" name="ratePlanId" value={ratePlanId} />
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            {state && state.ok && (
              <span className="text-xs text-success mr-auto">Saved.</span>
            )}
            <SubmitButton>Upsert override</SubmitButton>
          </>
        }
      >
        <Field label="Stay date" required>
          <input type="date" name="stayDate" required className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Nightly (minor units)">
            <input type="number" name="nightlyRateMinor" min={0} className={inputCls} />
          </Field>
          <Field label="Min LOS">
            <input type="number" name="minLos" min={1} max={365} className={inputCls} />
          </Field>
          <Field label="Source">
            <select name="source" className={selectCls} defaultValue="manual">
              <option value="manual">manual</option>
              <option value="pricelabs">pricelabs</option>
              <option value="channel">channel</option>
              <option value="import">import</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="stopSell" />
          Stop sell on this date
        </label>
        <Field label="Notes">
          <textarea name="notes" rows={2} maxLength={500} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
