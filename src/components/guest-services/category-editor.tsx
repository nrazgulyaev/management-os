"use client";

import { useActionState } from "react";
import type { GuestServiceCategory } from "@/lib/db/schema/guest-services";
import { upsertCategoryAction } from "@/features/guest-services/actions";

export function CategoryEditorForm({
  category,
}: {
  category?: GuestServiceCategory;
}) {
  const [state, dispatch] = useActionState(upsertCategoryAction, null);
  return (
    <form
      action={dispatch}
      className="rounded-md border border-line-soft bg-surface p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {category && <input type="hidden" name="id" value={category.id} />}
      <Field label="Name">
        <input
          name="name"
          required
          defaultValue={category?.name ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          placeholder="e.g. Wellness"
        />
      </Field>
      <Field label="Key (lowercase, no spaces)">
        <input
          name="key"
          required
          pattern="[a-z0-9_-]+"
          defaultValue={category?.key ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink font-mono"
          placeholder="wellness"
        />
      </Field>
      <Field label="Icon (lucide name)">
        <input
          name="icon"
          defaultValue={category?.icon ?? ""}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          placeholder="Sparkles"
        />
      </Field>
      <Field label="Sort order">
        <input
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          defaultValue={category?.sortOrder ?? 0}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        />
      </Field>
      <Field label="Description (optional)" className="md:col-span-2">
        <textarea
          name="description"
          rows={2}
          defaultValue={category?.description ?? ""}
          className="px-3 py-2 rounded-sm border border-line-soft bg-canvas text-sm text-ink resize-none"
          placeholder="Short blurb shown in admin only."
        />
      </Field>
      <Field label="Status">
        <select
          name="status"
          defaultValue={category?.status ?? "active"}
          className="h-10 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </Field>
      <div className="md:col-span-2 flex items-center gap-3 mt-2">
        <button
          type="submit"
          className="h-10 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 transition-colors"
        >
          {category ? "Save changes" : "Create category"}
        </button>
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
