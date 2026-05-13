/**
 * Stage 10.D.2 — EntityFormModal primitive.
 *
 * The audit found 30+ pages where Add navigates to a `/new` page
 * instead of opening a modal. This is the shared modal-Add primitive
 * every consumer should use for entity-creation + edit flows.
 *
 * Field config is declarative — no react-hook-form dep needed; the
 * modal owns local controlled state and validates per-field via a
 * `validate(value, row)` callback (synchronous; consumers can wrap a
 * zod parse if they want).
 *
 * Async-aware `onSubmit(values)` — the modal stays open with a busy
 * indicator until the promise resolves; thrown errors surface inline
 * and the form preserves user input (consistent with bookkeeper
 * acceptance criterion: "zero data loss on validation error").
 *
 * Used by: 10.F (top 20 modal-Add conversions), 10.E inline edit on
 * row-actions menu, settings forms.
 *
 * Reference patterns: research-summary.md theme 4 + 6 (gating + Excel
 * parity). Built on Radix Dialog.
 */
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "tel"
  | "date"
  | "select"
  | "checkbox";

export interface EntityFormField<T extends Record<string, unknown>> {
  name: keyof T & string;
  label: string;
  type?: FieldType;
  /** Placeholder hint for text-shaped fields. */
  placeholder?: string;
  /** Required marker — also enforced via the default validator. */
  required?: boolean;
  /** Options for `select` fields. */
  options?: { value: string; label: string }[];
  /** Help text rendered below the input. */
  helper?: string;
  /** Synchronous validator. Return null when valid, error string otherwise. */
  validate?: (value: unknown, row: T) => string | null;
  /** Span 1 (default) or 2 columns inside the grid layout. */
  span?: 1 | 2;
  /** Disable the field (e.g. when editing an immutable id). */
  disabled?: boolean;
}

export interface EntityFormModalProps<T extends Record<string, unknown>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: EntityFormField<T>[];
  /** Initial values; if absent the form starts empty. Edit flows pass current row. */
  initialValues?: Partial<T>;
  onSubmit: (values: T) => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  /** Width tier — defaults to "md" (~512px). */
  width?: "sm" | "md" | "lg";
  className?: string;
}

const WIDTH: Record<NonNullable<EntityFormModalProps<never>["width"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

function defaultValidator<T extends Record<string, unknown>>(
  field: EntityFormField<T>,
  value: unknown,
): string | null {
  if (field.required) {
    if (value == null || value === "" || (typeof value === "string" && value.trim() === ""))
      return `${field.label} is required`;
  }
  if (field.type === "email" && typeof value === "string" && value.length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email";
  }
  if (field.type === "number" && value !== null && value !== "" && typeof value === "string") {
    if (!Number.isFinite(Number(value))) return "Must be a number";
  }
  return null;
}

export function EntityFormModal<T extends Record<string, unknown>>({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initialValues,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  width = "md",
  className,
}: EntityFormModalProps<T>) {
  const [values, setValues] = React.useState<Record<string, unknown>>(
    () => (initialValues ?? {}) as Record<string, unknown>,
  );
  const [errors, setErrors] = React.useState<Record<string, string | null>>({});
  const [busy, setBusy] = React.useState(false);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValues((initialValues ?? {}) as Record<string, unknown>);
      setErrors({});
      setSubmitErr(null);
      setBusy(false);
    }
  }, [open, initialValues]);

  function validateAll(): Record<string, string | null> {
    const next: Record<string, string | null> = {};
    for (const f of fields) {
      const v = values[f.name];
      const err =
        defaultValidator(f, v) ??
        (f.validate ? f.validate(v, values as T) : null);
      next[f.name] = err;
    }
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next = validateAll();
    setErrors(next);
    if (Object.values(next).some((x) => !!x)) return;
    setSubmitErr(null);
    setBusy(true);
    try {
      await onSubmit(values as T);
      onOpenChange(false);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  function setField(name: string, raw: unknown) {
    setValues((v) => ({ ...v, [name]: raw }));
    // Clear the field error eagerly when the user edits.
    setErrors((e) => ({ ...e, [name]: null }));
  }

  return (
    <Dialog.Root open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full rounded-3xl bg-surface shadow-[var(--shadow-floating)] flex flex-col max-h-[90vh]",
            WIDTH[width],
            className,
          )}
        >
          <header className="flex items-start justify-between gap-2 px-5 py-4 border-b border-line-soft">
            <div>
              <Dialog.Title className="text-base font-medium text-ink">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-xs text-ink-tertiary mt-0.5">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="text-ink-tertiary hover:text-ink rounded-sm p-1 disabled:opacity-50"
              disabled={busy}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </header>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col flex-1 min-h-0"
            noValidate
          >
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-4">
                {fields.map((f) => (
                  <FieldRow
                    key={f.name}
                    field={f}
                    value={values[f.name]}
                    error={errors[f.name] ?? null}
                    onChange={(v) => setField(f.name, v)}
                  />
                ))}
              </div>
              {submitErr && (
                <div role="alert" className="mt-4 text-sm text-danger bg-danger-weak/40 rounded-sm px-3 py-2">
                  {submitErr}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line-soft bg-muted/30">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={busy}
                className="inline-flex items-center px-4 py-2 rounded-sm text-sm font-medium border border-line-soft bg-surface text-ink hover:bg-muted disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium bg-ink text-ink-inverse hover:bg-ink/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FieldRow<T extends Record<string, unknown>>({
  field,
  value,
  error,
  onChange,
}: {
  field: EntityFormField<T>;
  value: unknown;
  error: string | null;
  onChange: (v: unknown) => void;
}) {
  const id = `entity-form-field-${field.name}`;
  const inputCls = cn(
    "w-full px-3 py-2 rounded-sm border bg-surface text-ink text-sm focus:outline-2 focus:outline-accent",
    error ? "border-danger" : "border-line-soft",
    field.disabled && "opacity-60 pointer-events-none",
  );

  return (
    <div className={cn("flex flex-col gap-1.5", field.span === 2 && "col-span-2")}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {field.label}
        {field.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          disabled={field.disabled}
          className={inputCls}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : field.helper ? `${id}-helper` : undefined}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.disabled}
          className={inputCls}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : field.helper ? `${id}-helper` : undefined}
        >
          <option value="" disabled>
            {field.placeholder ?? "Select…"}
          </option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={field.disabled}
            className="w-4 h-4 rounded-sm border border-line-soft text-accent focus:outline-2 focus:outline-accent"
          />
          {field.helper ?? field.label}
        </label>
      ) : (
        <input
          id={id}
          type={field.type ?? "text"}
          value={(value as string | number) ?? ""}
          onChange={(e) =>
            onChange(
              field.type === "number" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value,
            )
          }
          placeholder={field.placeholder}
          disabled={field.disabled}
          className={inputCls}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : field.helper ? `${id}-helper` : undefined}
        />
      )}
      {field.helper && !error && (
        <p id={`${id}-helper`} className="text-xs text-ink-tertiary">
          {field.helper}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
