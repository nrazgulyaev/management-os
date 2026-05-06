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
import { createOwnerStayPolicyAction } from "@/features/owner-stays/actions";

export function OwnerStayPolicyForm({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(createOwnerStayPolicyAction, null);
  useEffect(() => {
    if (state?.ok && state.policyId) {
      router.push("/dashboard/owner-stays/policies");
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
            <SubmitButton>Create policy</SubmitButton>
          </>
        }
      >
        <Field label="Policy name" required>
          <input type="text" name="policyName" required maxLength={160} className={inputCls} />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Project (optional)">
            <select name="projectId" className={selectCls} defaultValue="">
              <option value="">— global / per-villa —</option>
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
          <Field label="Free nights per year">
            <input type="number" name="freeNightsPerYear" min={0} max={365} defaultValue={14} className={inputCls} />
          </Field>
          <Field label="Currency (3-letter)">
            <input type="text" name="currency" maxLength={3} className={inputCls} placeholder="USD" />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="freeNightsApplyToPeak" />
            Free nights apply to peak season
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresApproval" defaultChecked />
            Requires admin approval
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="relocationAllowed" defaultChecked />
            Allow relocating overlapping guest bookings
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allowDisplacingGuestBookings" />
            Allow displacing guest bookings (admin override)
          </label>
        </div>

        <Field label="Compensation model">
          <select name="compensationModel" className={selectCls} defaultValue="management_fee_on_expected_gross">
            <option value="none">none</option>
            <option value="fixed_per_night">fixed per night</option>
            <option value="management_fee_on_expected_gross">management fee on expected gross</option>
            <option value="percent_of_expected_gross">percent of expected gross</option>
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Compensation %">
            <input type="number" name="compensationPercent" min={0} max={100} step={0.5} className={inputCls} />
          </Field>
          <Field label="Fixed compensation (minor units)">
            <input type="number" name="fixedCompensationMinor" min={0} className={inputCls} />
          </Field>
        </div>

        <Field label="Operational cost model">
          <select name="operationalCostModel" className={selectCls} defaultValue="actual_costs">
            <option value="none">none</option>
            <option value="actual_costs">actual costs (post-stay)</option>
            <option value="fixed_per_stay">fixed per stay</option>
            <option value="fixed_per_night">fixed per night</option>
          </select>
        </Field>

        <Field label="Fixed operational cost (minor units)">
          <input type="number" name="fixedOperationalCostMinor" min={0} className={inputCls} />
        </Field>
      </FormShell>
    </form>
  );
}
