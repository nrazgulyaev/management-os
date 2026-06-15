"use client";

import {
  FormShell,
  Field,
  inputCls,
  selectCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { updateRatePlanAction } from "@/features/pricing/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface EditRatePlanDefaults {
  id: string;
  name: string;
  projectId: string | null;
  villaId: string | null;
  baseCurrency: string;
  baseNightlyRateMinor: number;
  managementFeePercent: string | null;
  status: string;
}

export function EditRatePlanForm({
  plan,
  villas,
  projects,
  onSuccess,
  onCancel,
}: {
  plan: EditRatePlanDefaults;
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    updateRatePlanAction,
    { onSuccess },
  );

  return (
    <form action={submitAction}>
      {/* Hidden id — scopes the org-checked UPDATE to this plan. */}
      <input type="hidden" name="id" value={plan.id} />
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton>Save changes</SubmitButton>
          </>
        }
      >
        <Field label="Name" required>
          <input
            type="text"
            name="name"
            required
            maxLength={160}
            defaultValue={plan.name}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Project (optional)">
            <select
              name="projectId"
              className={selectCls}
              defaultValue={plan.projectId ?? ""}
            >
              <option value="">— global / villa-specific —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Villa (optional, beats project)">
            <select
              name="villaId"
              className={selectCls}
              defaultValue={plan.villaId ?? ""}
            >
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
            <input
              type="text"
              name="baseCurrency"
              defaultValue={plan.baseCurrency}
              maxLength={3}
              className={inputCls}
            />
          </Field>
          <Field label="Base nightly rate (minor units)">
            <input
              type="number"
              name="baseNightlyRateMinor"
              min={0}
              defaultValue={plan.baseNightlyRateMinor}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Management fee % (optional)">
            <input
              type="number"
              name="managementFeePercent"
              min={0}
              max={100}
              step={0.5}
              defaultValue={plan.managementFeePercent ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Status" hint="Archive to retire the plan from quoting">
            <select
              name="status"
              className={selectCls}
              defaultValue={plan.status === "archived" ? "archived" : "active"}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
