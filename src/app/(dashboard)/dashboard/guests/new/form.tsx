"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createGuestAction } from "@/features/guests/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

export function GuestForm() {
  const [state, dispatch] = useActionState(createGuestAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={dispatch}>
      <FormShell
        title="Guest details"
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/guests">Cancel</Link>
            </Button>
            <SubmitButton>Create guest</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-2xl border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Full name" required error={errs.fullName?.[0]}>
          <input name="fullName" required className={inputCls} placeholder="A. Martin" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Email" error={errs.email?.[0]}>
            <input type="email" name="email" className={inputCls} />
          </Field>
          <Field label="Phone">
            <input name="phone" className={inputCls} placeholder="+62 …" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Nationality">
            <input name="nationality" className={inputCls} />
          </Field>
          <Field label="Preferred language">
            <input name="preferredLanguage" className={inputCls} placeholder="en / id / ja" />
          </Field>
          <Field label="WhatsApp">
            <input name="whatsapp" className={inputCls} />
          </Field>
        </div>
        <Field label="Status" required>
          <select name="status" defaultValue="active" className={selectCls}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </FormShell>
    </form>
  );
}
