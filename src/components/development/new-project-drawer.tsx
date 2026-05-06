"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createDevelopmentProject } from "@/lib/development/server/actions";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";

const acquisitionOptions = [
  { value: "leasehold", label: "Leasehold" },
  { value: "freehold", label: "Freehold" },
  { value: "joint_venture", label: "Joint venture" },
  { value: "mixed", label: "Mixed" },
] as const;

export function NewProjectDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open]);

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createDevelopmentProject(formData);
      if (!result.ok) {
        setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      onOpenChange(false);
      router.push(`${DEVELOPMENT_APP_PATH}/projects/${result.slug}`);
      router.refresh();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        className="absolute right-0 top-0 h-full w-full max-w-md bg-canvas border-l border-line-soft shadow-[var(--shadow-floating)] flex flex-col"
      >
        <header className="px-6 h-16 border-b border-line-soft flex items-center justify-between">
          <h2
            id="new-project-title"
            className="text-display text-[20px] font-medium text-ink"
          >
            New project
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink-tertiary hover:text-ink"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </header>

        <form
          action={onSubmit}
          className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5"
        >
          <p className="text-sm text-ink-secondary leading-relaxed">
            Stage 2.1 minimal create. Fills <code className="font-mono text-xs">projects</code>,{" "}
            <code className="font-mono text-xs">development_project_meta</code>, and seeds a{" "}
            <code className="font-mono text-xs">land_sourcing</code> phase. Full setup wizard ships in 2.2.
          </p>

          <Field
            name="name"
            label="Project name"
            placeholder="e.g. Vela Residences"
            required
            error={fieldErrors.name?.[0]}
          />
          <Field
            name="location"
            label="Location"
            placeholder="e.g. Bingin, Bali"
            required
            error={fieldErrors.location?.[0]}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-label">Acquisition mode</label>
            <select
              name="acquisitionMode"
              defaultValue="leasehold"
              className="h-10 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
            >
              {acquisitionOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {fieldErrors.acquisitionMode && (
              <span className="text-xs text-danger">
                {fieldErrors.acquisitionMode[0]}
              </span>
            )}
          </div>

          <Field
            name="landAreaSqm"
            label="Land area (m²) — optional"
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="e.g. 4200"
            error={fieldErrors.landAreaSqm?.[0]}
          />

          {error && (
            <div className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 flex items-start gap-2">
              <Badge tone="danger">Error</Badge>
              <span className="text-sm text-ink leading-relaxed">{error}</span>
            </div>
          )}
        </form>

        <footer className="px-6 py-4 border-t border-line-soft flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            form="new-project-form"
            type="submit"
            disabled={pending}
            onClick={(e) => {
              // The form has no id; instead we submit by finding the dialog form.
              const form = e.currentTarget.closest("aside")?.querySelector("form");
              if (form) {
                e.preventDefault();
                form.requestSubmit();
              }
            }}
          >
            {pending ? "Creating…" : "Create project"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
  inputMode,
  step,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  step?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        step={step}
        className={cn(
          "h-10 rounded-sm border bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none",
          error
            ? "border-danger focus:border-danger"
            : "border-line-soft focus:border-line-strong",
        )}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
