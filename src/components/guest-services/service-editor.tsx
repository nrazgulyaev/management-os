"use client";

import * as React from "react";
import { useActionState } from "react";
import type { GuestService } from "@/lib/db/schema/guest-services";
import { upsertServiceAction } from "@/features/guest-services/actions";
import {
  PRICING_MODELS,
  SERVICE_TYPES,
} from "@/features/guest-services/schema";

export interface CategoryOption {
  id: string;
  name: string;
}
export interface ProjectOption {
  id: string;
  name: string;
}
export interface VillaOption {
  id: string;
  unitCode: string | null;
  projectName: string | null;
}

export function ServiceEditorForm({
  service,
  categories,
  projects,
  villas,
  onSuccess,
  onCancel,
}: {
  service?: GuestService;
  categories: CategoryOption[];
  projects: ProjectOption[];
  villas: VillaOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(upsertServiceAction, null);
  React.useEffect(() => {
    if (state?.ok && onSuccess) onSuccess();
  }, [state, onSuccess]);
  return (
    <form
      action={dispatch}
      className="rounded-md border border-line-soft bg-surface p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {service && <input type="hidden" name="id" value={service.id} />}

      <Field label="Name">
        <input
          name="name"
          required
          defaultValue={service?.name ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          placeholder="Airport transfer"
        />
      </Field>
      <Field label="Service key (lowercase)">
        <input
          name="serviceKey"
          required
          pattern="[a-z0-9_-]+"
          defaultValue={service?.serviceKey ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink font-mono"
          placeholder="airport-transfer"
        />
      </Field>

      <Field label="Category">
        <select
          name="categoryId"
          defaultValue={service?.categoryId ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Service type">
        <select
          name="serviceType"
          required
          defaultValue={service?.serviceType ?? "transfer"}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Scope · project (optional)">
        <select
          name="projectId"
          defaultValue={service?.projectId ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        >
          <option value="">Global</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Scope · villa (optional)">
        <select
          name="villaId"
          defaultValue={service?.villaId ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        >
          <option value="">All villas</option>
          {villas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.unitCode ?? v.id.slice(0, 6)} · {v.projectName ?? "—"}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Pricing model">
        <select
          name="pricingModel"
          defaultValue={service?.pricingModel ?? "fixed"}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        >
          {PRICING_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Currency">
        <input
          name="currency"
          defaultValue={service?.currency ?? "USD"}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink font-mono"
        />
      </Field>

      <Field label="Base price (minor units, e.g. 5000 = $50.00)">
        <input
          name="basePriceMinor"
          type="number"
          min={0}
          defaultValue={service ? service.basePriceMinor.toString() : "0"}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink font-mono tabular-nums"
        />
      </Field>
      <Field label="Internal cost (minor, optional)">
        <input
          name="internalCostMinor"
          type="number"
          min={0}
          defaultValue={
            service?.internalCostMinor != null
              ? service.internalCostMinor.toString()
              : ""
          }
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink font-mono tabular-nums"
          placeholder="margin analytics"
        />
      </Field>

      <Field label="Min quantity">
        <input
          name="minQuantity"
          type="number"
          min={1}
          defaultValue={service?.minQuantity ?? 1}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        />
      </Field>
      <Field label="Max quantity (optional)">
        <input
          name="maxQuantity"
          type="number"
          min={1}
          defaultValue={service?.maxQuantity ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        />
      </Field>

      <Field label="Lead time (hours, optional)">
        <input
          name="leadTimeHours"
          type="number"
          min={0}
          defaultValue={service?.leadTimeHours ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        />
      </Field>
      <Field label="Sort order">
        <input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={service?.sortOrder ?? 0}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        />
      </Field>

      <Field label="Image URL (optional)" className="md:col-span-2">
        <input
          name="imageUrl"
          type="url"
          defaultValue={service?.imageUrl ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        />
      </Field>

      <Field label="Short description" className="md:col-span-2">
        <input
          name="shortDescription"
          defaultValue={service?.shortDescription ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          placeholder="Single-line teaser shown on the catalog card"
        />
      </Field>
      <Field label="Description (markdown)" className="md:col-span-2">
        <textarea
          name="descriptionMd"
          rows={4}
          defaultValue={service?.descriptionMd ?? ""}
          className="px-3 py-2 rounded-sm border border-line-soft bg-canvas text-sm text-ink resize-none"
        />
      </Field>
      <Field label="Cancellation policy (markdown, optional)" className="md:col-span-2">
        <textarea
          name="cancellationPolicyMd"
          rows={2}
          defaultValue={service?.cancellationPolicyMd ?? ""}
          className="px-3 py-2 rounded-sm border border-line-soft bg-canvas text-sm text-ink resize-none"
        />
      </Field>

      <fieldset className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
        <Toggle
          name="requiresDate"
          defaultChecked={service?.requiresDate ?? true}
          label="Requires date"
        />
        <Toggle
          name="requiresTime"
          defaultChecked={service?.requiresTime ?? false}
          label="Requires time"
        />
        <Toggle
          name="requiresGuestCount"
          defaultChecked={service?.requiresGuestCount ?? false}
          label="Requires guest count"
        />
        <Toggle
          name="requiresAdminConfirmation"
          defaultChecked={service?.requiresAdminConfirmation ?? true}
          label="Needs admin confirmation"
        />
        <Toggle
          name="allowMultipleDays"
          defaultChecked={service?.allowMultipleDays ?? false}
          label="Allow multi-day"
        />
        <Toggle
          name="guestVisible"
          defaultChecked={service?.guestVisible ?? true}
          label="Guest-visible"
        />
      </fieldset>

      <Field label="Status">
        <select
          name="status"
          defaultValue={service?.status ?? "active"}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        >
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </Field>

      <div className="md:col-span-2 flex items-center gap-3 mt-2">
        <button
          type="submit"
          className="h-10 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 transition-colors"
        >
          {service ? "Save changes" : "Create service"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-5 rounded-full border border-line-soft text-sm text-ink hover:bg-muted"
          >
            Cancel
          </button>
        )}
        {state?.ok && (
          <span className="text-xs text-success">Saved.</span>
        )}
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
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-secondary">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="true"
        className="w-4 h-4"
      />
      {label}
    </label>
  );
}
