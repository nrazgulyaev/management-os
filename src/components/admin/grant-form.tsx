"use client";

import { useActionState } from "react";
import { Field, FormShell, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createOwnerAccessGrantAction } from "@/features/access-grants/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function GrantForm({
  fixedOwnerId,
  fixedAppUserId,
  owners,
  appUsers,
  cancelHref,
}: {
  fixedOwnerId?: string;
  fixedAppUserId?: string;
  owners?: Option[];
  appUsers?: Option[];
  cancelHref: string;
}) {
  const [state, dispatch] = useActionState(createOwnerAccessGrantAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={dispatch}>
      <FormShell
        title="Grant owner-portal access"
        description="Links a Supabase auth user to an owner identity. Audited."
        footer={
          <>
            <Button asChild variant="ghost">
              <a href={cancelHref}>Cancel</a>
            </Button>
            <SubmitButton>Grant access</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        {fixedAppUserId ? (
          <input type="hidden" name="appUserId" value={fixedAppUserId} />
        ) : (
          <Field label="App user" required error={errs.appUserId?.[0]}>
            <select name="appUserId" required defaultValue="" className={selectCls}>
              <option value="" disabled>
                Pick an app user
              </option>
              {appUsers?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {fixedOwnerId ? (
          <input type="hidden" name="ownerId" value={fixedOwnerId} />
        ) : (
          <Field label="Owner" required error={errs.ownerId?.[0]}>
            <select name="ownerId" required defaultValue="" className={selectCls}>
              <option value="" disabled>
                Pick an owner
              </option>
              {owners?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Grant type" required>
          <select name="grantType" defaultValue="owner_portal" className={selectCls}>
            <option value="owner_portal">Owner portal</option>
            <option value="investor_readonly">Investor (read-only)</option>
            <option value="finance_approver">Finance approver</option>
          </select>
        </Field>

        <Field label="Notes" hint="Optional — what's the context for this grant">
          <textarea name="notes" rows={3} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}

