"use client";

import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createOwnerAction, updateOwnerAction } from "./actions";
import type { ActionResult } from "@/features/projects/actions";

export interface OwnerFormDefaults {
  id?: string;
  type?: string;
  displayName?: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  taxResidency?: string | null;
  status?: string;
}

export function OwnerForm({
  mode,
  defaults,
  cancelHref = "/dashboard/owners",
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  defaults?: OwnerFormDefaults;
  cancelHref?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const action = mode === "edit" ? updateOwnerAction : createOwnerAction;
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    action,
    { onSuccess },
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const v = defaults ?? {};
  return (
    <form action={submitAction}>
      {mode === "edit" && v.id && <input type="hidden" name="id" value={v.id} />}
      <FormShell
        title={mode === "edit" ? "Edit owner" : "Owner details"}
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            )}
            <SubmitButton>{mode === "edit" ? "Save changes" : "Create owner"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Display name" required error={errs.displayName?.[0]}>
            <input name="displayName" required defaultValue={v.displayName} className={inputCls} />
          </Field>
          <Field label="Type" required>
            <select name="type" defaultValue={v.type ?? "individual"} className={selectCls}>
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="family_office">Family office</option>
            </select>
          </Field>
        </div>
        <Field label="Legal name">
          <input name="legalName" defaultValue={v.legalName ?? ""} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Email" error={errs.email?.[0]}>
            <input
              type="email"
              name="email"
              defaultValue={v.email ?? ""}
              className={inputCls}
              placeholder="owner@example.com"
            />
          </Field>
          <Field label="Phone">
            <input name="phone" defaultValue={v.phone ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Nationality">
            <input name="nationality" defaultValue={v.nationality ?? ""} className={inputCls} />
          </Field>
          <Field label="Tax residency">
            <input name="taxResidency" defaultValue={v.taxResidency ?? ""} className={inputCls} />
          </Field>
          <Field label="Status" required hint="active · onboarding · inactive · archived">
            <select name="status" defaultValue={v.status ?? "onboarding"} className={selectCls}>
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
