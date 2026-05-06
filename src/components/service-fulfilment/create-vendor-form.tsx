"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createServiceVendorAction } from "@/features/service-fulfilment/actions";

const VENDOR_TYPES = [
  "transport",
  "chef",
  "wellness",
  "laundry",
  "rental",
  "activity",
  "maintenance",
  "other",
];

export function CreateVendorForm() {
  const [state, dispatch] = useActionState(createServiceVendorAction, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.id) {
      router.push(`/dashboard/service-fulfilment/vendors/${state.id}`);
    }
  }, [state, router]);
  return (
    <form
      action={dispatch}
      className="flex flex-col gap-4 rounded-md border border-line-soft bg-surface p-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input name="vendorCode" label="Vendor code" required />
        <Input name="displayName" label="Display name" required />
        <Input name="legalName" label="Legal name" />
        <Select name="vendorType" label="Type" options={VENDOR_TYPES} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input name="contactName" label="Contact name" />
        <Input name="contactPhone" label="Contact phone" />
        <Input name="contactEmail" label="Contact email" type="email" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select
          name="preferredChannel"
          label="Preferred channel"
          options={["", "whatsapp", "phone", "email", "in_app", "manual"]}
        />
        <Input name="serviceArea" label="Service area" />
        <Input name="defaultCurrency" label="Default currency" defaultValue="USD" />
      </div>
      <Textarea name="internalNotes" label="Internal notes" />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Create vendor
        </button>
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

function Input(props: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
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

function Textarea(props: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <textarea
        name={props.name}
        rows={3}
        className="px-3 py-2 rounded-md border border-line-soft bg-canvas text-sm text-ink"
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
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
