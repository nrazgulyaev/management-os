"use client";

import { useActionState } from "react";
import type { GuestServiceOption } from "@/lib/db/schema/guest-services";
import { upsertServiceOptionAction } from "@/features/guest-services/actions";

export function OptionEditorForm({
  serviceId,
  option,
}: {
  serviceId: string;
  option?: GuestServiceOption;
}) {
  const [state, dispatch] = useActionState(upsertServiceOptionAction, null);
  return (
    <form
      action={dispatch}
      className="rounded-md border border-line-soft bg-canvas p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
    >
      {option && <input type="hidden" name="id" value={option.id} />}
      <input type="hidden" name="serviceId" value={serviceId} />
      <Field label="Key">
        <input
          name="optionKey"
          required
          pattern="[a-z0-9_-]+"
          defaultValue={option?.optionKey ?? ""}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm font-mono"
          placeholder="60min"
        />
      </Field>
      <Field label="Label">
        <input
          name="label"
          required
          defaultValue={option?.label ?? ""}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm"
          placeholder="60 minutes"
        />
      </Field>
      <Field label="Price delta (minor)">
        <input
          name="priceDeltaMinor"
          type="number"
          defaultValue={option ? option.priceDeltaMinor.toString() : "0"}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm font-mono tabular-nums"
        />
      </Field>
      <Field label="Cost delta (minor, optional)">
        <input
          name="internalCostDeltaMinor"
          type="number"
          defaultValue={
            option?.internalCostDeltaMinor != null
              ? option.internalCostDeltaMinor.toString()
              : ""
          }
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm font-mono tabular-nums"
        />
      </Field>
      <Field label="Sort">
        <input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={option?.sortOrder ?? 0}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm"
        />
      </Field>
      <Field label="Status">
        <select
          name="status"
          defaultValue={option?.status ?? "active"}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </Field>
      <label className="inline-flex items-center gap-2 text-xs text-ink-secondary">
        <input
          name="isDefault"
          type="checkbox"
          value="true"
          defaultChecked={option?.isDefault ?? false}
          className="w-4 h-4"
        />
        Default selection
      </label>
      <Field label="Description (optional)" className="md:col-span-3">
        <input
          name="description"
          defaultValue={option?.description ?? ""}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm"
        />
      </Field>
      <div className="md:col-span-3 flex items-center gap-3 mt-1">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          {option ? "Save" : "Add option"}
        </button>
        {state?.ok && <span className="text-xs text-success">Saved.</span>}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
