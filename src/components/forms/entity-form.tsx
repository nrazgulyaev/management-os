"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormShell } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";

/**
 * Stage 6.P0 — generic <EntityForm<T>> template.
 *
 * Codifies the platform's established React 19 server-action form
 * shape (useActionState + FormShell + SubmitButton + ActionResult)
 * into a single typed wrapper for *new* entity forms (Tier 1–5 work
 * starting in P0.4). Existing forms (ProjectForm, VillaForm) keep
 * their hand-written shape — they already match the convention.
 *
 * Why a wrapper at all?
 *   - One place to render the error banner consistently
 *   - One place to render the cancel/submit footer consistently
 *   - One place to wire the optional onSuccess callback (used by the
 *     EntityModal pattern — close the modal once the action returns ok)
 *   - Type-safe `ActionResult<T>` so callers see field-error keys
 *
 * Pattern (call site — new entity form):
 *
 *   <EntityForm
 *     mode="create"
 *     action={createCostCategoryAction}
 *     submitLabel="Create cost category"
 *     onSuccess={() => onClose()}
 *     cancelHref="/development-os/finance"
 *   >
 *     {(errs) => (
 *       <>
 *         <Field label="Code" required error={errs.code?.[0]}>
 *           <input name="code" required className={inputCls} />
 *         </Field>
 *         <Field label="Name" required error={errs.name?.[0]}>
 *           <input name="name" required className={inputCls} />
 *         </Field>
 *       </>
 *     )}
 *   </EntityForm>
 *
 * The render-prop (`children: (errs) => ReactNode`) gives field-level
 * error mapping without forcing a config-driven JSON schema (which
 * would be a regression from the existing hand-written approach).
 */

export type ActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type EntityFormAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export interface EntityFormProps {
  mode: "create" | "edit";
  action: EntityFormAction;
  /** Hidden form fields (typically `id` for edit-mode). */
  hiddenFields?: Record<string, string | number | undefined>;
  /** Render-prop receives the current `fieldErrors` map. */
  children: (errs: Record<string, string[] | undefined>) => ReactNode;
  /** Footer label override. Defaults: "Create" / "Save changes". */
  submitLabel?: string;
  cancelLabel?: string;
  cancelHref?: string;
  /** Optional explicit cancel handler (overrides cancelHref). */
  onCancel?: () => void;
  /** Fires once the action returns ok. Used by EntityModal to auto-close. */
  onSuccess?: () => void;
  /** Wraps in FormShell with title/description. Set to null for bare-form usage (e.g. inside a modal that already supplies a header). */
  title?: string | null;
  description?: string;
}

export function EntityForm({
  mode,
  action,
  hiddenFields,
  children,
  submitLabel,
  cancelLabel = "Cancel",
  cancelHref,
  onCancel,
  onSuccess,
  title,
  description,
}: EntityFormProps) {
  const [state, dispatch] = useActionState<ActionResult | null, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (result.ok) onSuccess?.();
      return result;
    },
    null,
  );
  const errs: Record<string, string[] | undefined> =
    state && !state.ok ? state.fieldErrors ?? {} : {};

  const defaultLabel = mode === "edit" ? "Save changes" : "Create";
  const finalSubmitLabel = submitLabel ?? defaultLabel;

  const footer = (
    <>
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : cancelHref ? (
        <Button asChild variant="ghost">
          <Link href={cancelHref}>{cancelLabel}</Link>
        </Button>
      ) : null}
      <SubmitButton>{finalSubmitLabel}</SubmitButton>
    </>
  );

  const body = (
    <>
      {hiddenFields &&
        Object.entries(hiddenFields).map(([k, v]) =>
          v === undefined ? null : (
            <input key={k} type="hidden" name={k} value={String(v)} />
          ),
        )}
      {state && !state.ok && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
          {state.error}
        </div>
      )}
      {children(errs)}
    </>
  );

  // `title === null` → caller wants the form bare (e.g. inside an
  // EntityModal whose header already shows the title).
  if (title === null) {
    return (
      <form
        action={dispatch}
        className="px-5 md:px-6 py-5 flex flex-col gap-5"
      >
        {body}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
          {footer}
        </div>
      </form>
    );
  }

  return (
    <form action={dispatch}>
      <FormShell title={title} description={description} footer={footer}>
        {body}
      </FormShell>
    </form>
  );
}
