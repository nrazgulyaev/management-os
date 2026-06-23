"use client";

import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createGuestAction, updateGuestAction } from "./actions";
import type { ActionResult } from "@/features/projects/actions";

export interface GuestFormDefaults {
  id?: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  preferredLanguage?: string | null;
  whatsapp?: string | null;
  status?: string;
}

export function GuestForm({
  mode = "create",
  defaults,
  cancelHref = "/dashboard/guests",
  onSuccess,
  onCancel,
}: {
  mode?: "create" | "edit";
  defaults?: GuestFormDefaults;
  cancelHref?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const action = mode === "edit" ? updateGuestAction : createGuestAction;
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
        title={mode === "edit" ? "Edit guest" : "Guest details"}
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
            <SubmitButton>{mode === "edit" ? "Save changes" : "Create guest"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-2xl border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Full name" required error={errs.fullName?.[0]}>
          <input
            name="fullName"
            required
            defaultValue={v.fullName ?? ""}
            className={inputCls}
            placeholder="A. Martin"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Email" error={errs.email?.[0]}>
            <input
              type="email"
              name="email"
              defaultValue={v.email ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              name="phone"
              defaultValue={v.phone ?? ""}
              className={inputCls}
              placeholder="+62 …"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Nationality">
            <input
              name="nationality"
              defaultValue={v.nationality ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Preferred language">
            <input
              name="preferredLanguage"
              defaultValue={v.preferredLanguage ?? ""}
              className={inputCls}
              placeholder="en / id / ja"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              name="whatsapp"
              defaultValue={v.whatsapp ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Status" required>
          <select
            name="status"
            defaultValue={v.status ?? "active"}
            className={selectCls}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </FormShell>
    </form>
  );
}
