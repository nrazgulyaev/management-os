"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPricingRuleSetAction } from "@/features/dynamic-pricing/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CreateRuleSetForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
} = {}) {
  const [state, dispatch] = useActionState(createPricingRuleSetAction, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.id) {
      if (onSuccess) onSuccess();
      else router.push(`/dashboard/pricing/rule-sets/${state.id}`);
    }
  }, [state, router, onSuccess]);
  return (
    <form action={dispatch} className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Code">
          <Input name="ruleSetCode" required />
        </Field>
        <Field label="Name">
          <Input name="name" required />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Scope">
          <Select name="scopeType" defaultValue="global">
            <option value="global">global</option>
            <option value="project">project</option>
            <option value="villa">villa</option>
          </Select>
        </Field>
        <Field label="Project ID (optional)">
          <Input name="projectId" />
        </Field>
        <Field label="Villa ID (optional)">
          <Input name="villaId" />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Priority">
          <Input name="priority" type="number" defaultValue="100" />
        </Field>
        <Field label="Currency">
          <Input name="currency" defaultValue="USD" />
        </Field>
        <Field label="Base rate (minor)">
          <Input name="baseRateMinor" type="number" required defaultValue="50000" />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Min rate (minor, optional)">
          <Input name="minRateMinor" type="number" />
        </Field>
        <Field label="Max rate (minor, optional)">
          <Input name="maxRateMinor" type="number" />
        </Field>
      </div>
      <div className="flex items-center gap-2 mt-1 pt-3.5 border-t border-line-soft">
        {state && !state.ok && <span className="text-[12px] text-danger">{state.error}</span>}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary btn-sm ml-auto"
          >
            Cancel
          </button>
        )}
        <button type="submit" className={`btn btn-accent btn-sm${onCancel ? "" : " ml-auto"}`}>
          Create rule set
        </button>
      </div>
    </form>
  );
}
