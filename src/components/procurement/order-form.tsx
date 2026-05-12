"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createPurchaseOrderAction } from "@/features/procurement/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function PurchaseOrderForm({
  suppliers,
  projects,
  villas,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  suppliers: Option[];
  projects: Option[];
  villas: Option[];
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createPurchaseOrderAction, initial);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (onSuccess) onSuccess();
      else if (state.redirectTo) router.push(state.redirectTo);
    }
  }, [state, router, onSuccess]);
  return (
    <form action={dispatch}>
      <FormShell
        title="New purchase order"
        description="Lines can be added on the detail page after creation."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            ) : (
              <Button asChild variant="ghost"><a href={cancelHref}>Cancel</a></Button>
            )}
            <SubmitButton>Create PO</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier">
            <select name="supplierId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
            </select>
          </Field>
          <Field label="Expected delivery"><input type="date" name="expectedDelivery" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Project">
            <select name="projectId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
            </select>
          </Field>
          <Field label="Villa">
            <select name="villaId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {villas.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
            </select>
          </Field>
        </div>
        <Field label="Currency"><input name="currency" maxLength={3} className={inputCls + " uppercase"} placeholder="USD" /></Field>
        <Field label="Notes"><textarea name="notes" rows={3} className={textareaCls} /></Field>
      </FormShell>
    </form>
  );
}
