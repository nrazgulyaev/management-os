"use client";

import { useActionState } from "react";
import {
  FormShell,
  Field,
  inputCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { createRatePlanSeasonAction } from "@/features/pricing/actions";

export function CreateSeasonForm({ ratePlanId }: { ratePlanId: string }) {
  const [state, dispatch] = useActionState(createRatePlanSeasonAction, null);
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
              <span className="text-xs text-success mr-auto">Created.</span>
            )}
            <SubmitButton>Add season</SubmitButton>
          </>
        }
      >
        <Field label="Name" required>
          <input type="text" name="name" required maxLength={160} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Starts on" required>
            <input type="date" name="startsOn" required className={inputCls} />
          </Field>
          <Field label="Ends on" required>
            <input type="date" name="endsOn" required className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Multiplier">
            <input type="number" step={0.05} name="multiplier" defaultValue={1} className={inputCls} />
          </Field>
          <Field label="Or fixed nightly (minor)">
            <input type="number" name="nightlyRateMinor" min={0} className={inputCls} />
          </Field>
          <Field label="Min LOS">
            <input type="number" name="minLos" min={1} max={365} className={inputCls} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="stopSell" />
          Stop sell during this season
        </label>
      </FormShell>
    </form>
  );
}
