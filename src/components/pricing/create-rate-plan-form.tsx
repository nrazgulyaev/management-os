"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createRatePlanAction } from "@/features/pricing/actions";

export function CreateRatePlanForm({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(createRatePlanAction, null);

  useEffect(() => {
    if (state?.ok && state.ratePlanId) {
      router.push(`/dashboard/bookings/rates/${state.ratePlanId}`);
    }
  }, [state, router]);

  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <SubmitButton>Create plan</SubmitButton>
          </>
        }
      >
        <Field label="Name" required>
          <input type="text" name="name" required maxLength={160} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Project (optional)">
            <select name="projectId" className={selectCls} defaultValue="">
              <option value="">— global / villa-specific —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Villa (optional, beats project)">
            <select name="villaId" className={selectCls} defaultValue="">
              <option value="">—</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Base currency">
            <input type="text" name="baseCurrency" defaultValue="USD" maxLength={3} className={inputCls} />
          </Field>
          <Field label="Base nightly rate (minor units)">
            <input type="number" name="baseNightlyRateMinor" min={0} className={inputCls} />
          </Field>
        </div>
        <Field label="Management fee % (optional)">
          <input type="number" name="managementFeePercent" min={0} max={100} step={0.5} className={inputCls} />
        </Field>
      </FormShell>
    </form>
  );
}
