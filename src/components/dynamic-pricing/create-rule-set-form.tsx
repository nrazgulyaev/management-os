"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPricingRuleSetAction } from "@/features/dynamic-pricing/actions";

export function CreateRuleSetForm() {
  const [state, dispatch] = useActionState(createPricingRuleSetAction, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.id) {
      router.push(`/dashboard/pricing/rule-sets/${state.id}`);
    }
  }, [state, router]);
  return (
    <form action={dispatch} className="flex flex-col gap-3 rounded-md border border-line-soft bg-surface p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input name="ruleSetCode" label="Code" required />
        <Input name="name" label="Name" required />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select name="scopeType" label="Scope" options={["global", "project", "villa"]} />
        <Input name="projectId" label="Project ID (optional)" />
        <Input name="villaId" label="Villa ID (optional)" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input name="priority" label="Priority" type="number" defaultValue="100" />
        <Input name="currency" label="Currency" defaultValue="USD" />
        <Input name="baseRateMinor" label="Base rate (minor)" type="number" required defaultValue="50000" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input name="minRateMinor" label="Min rate (minor, optional)" type="number" />
        <Input name="maxRateMinor" label="Max rate (minor, optional)" type="number" />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90">
          Create rule set
        </button>
        {state && !state.ok && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

function Input(props: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        required={props.required}
        className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      />
    </label>
  );
}

function Select(props: { name: string; label: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <select
        name={props.name}
        defaultValue={props.options[0]}
        className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      >
        {props.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
