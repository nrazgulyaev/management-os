"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createUtilityAccountAction } from "@/features/utilities/actions";

const TYPES = ["electricity", "water", "internet", "gas", "waste", "security", "other"] as const;

export function UtilityAccountForm({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(createUtilityAccountAction, null);
  useEffect(() => {
    if (state?.ok && state.accountId) {
      router.push(`/dashboard/utilities/accounts/${state.accountId}`);
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
            <SubmitButton>Create account</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Villa (optional)">
            <select name="villaId" className={selectCls} defaultValue="">
              <option value="">— project-level —</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (optional)">
            <select name="projectId" className={selectCls} defaultValue="">
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Utility type" required>
            <select name="utilityType" required className={selectCls} defaultValue="">
              <option value="">Select…</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Provider name">
            <input type="text" name="providerName" maxLength={160} className={inputCls} placeholder="e.g. PLN, PDAM, Biznet" />
          </Field>
          <Field label="Account number">
            <input type="text" name="accountNumber" maxLength={80} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tokenMeter" />
            Token meter (prepaid)
          </label>
          <Field label="Billing cycle day">
            <input type="number" name="billingCycleDay" min={1} max={31} className={inputCls} />
          </Field>
          <Field label="Currency">
            <input type="text" name="currency" defaultValue="IDR" maxLength={3} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Avg monthly cost (minor)">
            <input type="number" name="averageMonthlyCostMinor" min={0} className={inputCls} />
          </Field>
          <Field label="Low balance threshold (minor)">
            <input type="number" name="lowBalanceThresholdMinor" min={0} className={inputCls} />
          </Field>
          <Field label="Critical balance threshold (minor)">
            <input type="number" name="criticalBalanceThresholdMinor" min={0} className={inputCls} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea name="notes" rows={2} maxLength={1000} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
