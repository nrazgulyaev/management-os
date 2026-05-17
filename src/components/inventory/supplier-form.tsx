"use client";

import Link from "next/link";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createSupplierAction } from "@/features/inventory/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

export function SupplierForm({ cancelHref }: { cancelHref: string }) {
  const [state, dispatch] = useActionState(createSupplierAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);
  return (
    <form action={dispatch}>
      <FormShell
        title="New supplier"
        footer={
          <>
            <Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button>
            <SubmitButton>Create supplier</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Name" required error={errs.name?.[0]}>
          <input name="name" required className={inputCls} placeholder="Bali Linen Co." />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select name="supplierType" defaultValue="general" className={selectCls}>
              <option value="general">General</option>
              <option value="linens">Linens</option>
              <option value="toiletries">Toiletries</option>
              <option value="maintenance">Maintenance</option>
              <option value="electrical">Electrical</option>
              <option value="plumbing">Plumbing</option>
              <option value="furniture">Furniture</option>
              <option value="construction">Construction</option>
              <option value="chemicals">Chemicals</option>
              <option value="food_beverage">Food & beverage</option>
              <option value="service">Service</option>
            </select>
          </Field>
          <Field label="Country"><input name="country" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact name"><input name="contactName" className={inputCls} /></Field>
          <Field label="Email"><input type="email" name="email" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone"><input name="phone" className={inputCls} /></Field>
          <Field label="WhatsApp"><input name="whatsapp" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency"><input name="currency" maxLength={3} className={inputCls + " uppercase"} placeholder="USD" /></Field>
          <Field label="Payment terms"><input name="paymentTerms" className={inputCls} placeholder="Net 30" /></Field>
        </div>
        <Field label="Address"><textarea name="address" rows={2} className={textareaCls} /></Field>
        <Field label="Notes"><textarea name="notes" rows={2} className={textareaCls} /></Field>
      </FormShell>
    </form>
  );
}
