"use client";

import Link from "next/link";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createInventoryLocationAction } from "@/features/inventory/actions";
import type { ActionResult } from "@/features/projects/actions";

interface Option {
  id: string;
  label: string;
}

const initial: ActionResult | null = null;

export function LocationForm({
  projects,
  villas,
  cancelHref,
}: {
  projects: Option[];
  villas: Option[];
  cancelHref: string;
}) {
  const [state, dispatch] = useActionState(createInventoryLocationAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={dispatch}>
      <FormShell
        title="New storage location"
        footer={
          <>
            <Button asChild variant="ghost"><Link href={cancelHref}>Cancel</Link></Button>
            <SubmitButton>Create location</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Name" required error={errs.name?.[0]}>
          <input name="name" required className={inputCls} placeholder="Eternal Main Storage" />
        </Field>
        <Field label="Type" required>
          <select name="locationType" defaultValue="warehouse" className={selectCls}>
            <option value="warehouse">Warehouse</option>
            <option value="villa_storage">Villa storage</option>
            <option value="housekeeping_cart">Housekeeping cart</option>
            <option value="maintenance_room">Maintenance room</option>
            <option value="supplier">Supplier</option>
            <option value="disposal">Disposal</option>
          </select>
        </Field>
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
        <Field label="Description"><textarea name="description" rows={3} className={textareaCls} /></Field>
      </FormShell>
    </form>
  );
}
