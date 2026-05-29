"use client";

import Link from "next/link";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createDamageReportAction } from "@/features/operations/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function DamageReportForm({
  villas,
  defaultVillaId,
  defaultTaskId,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  villas: Option[];
  defaultVillaId?: string;
  defaultTaskId?: string;
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createDamageReportAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
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
        title="New damage report"
        description="Damage discovered on turnover or guest stay. Records cost and chargeable parties."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            )}
            <SubmitButton>Log damage</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        {defaultTaskId && <input type="hidden" name="taskId" value={defaultTaskId} />}

        <Field label="Title" required error={errs.title?.[0]}>
          <input name="title" required className={inputCls} placeholder="Bedside lamp shade torn" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Villa">
            <select name="villaId" defaultValue={defaultVillaId ?? ""} className={selectCls}>
              <option value="">— None</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select name="severity" defaultValue="p2" className={selectCls}>
              <option value="p0">P0 · urgent</option>
              <option value="p1">P1 · high</option>
              <option value="p2">P2 · normal</option>
              <option value="p3">P3 · low</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Estimated cost (minor)">
            <input type="number" name="estimatedCostMinor" min={0} className={inputCls} />
          </Field>
          <Field label="Currency">
            <input
              name="currency"
              maxLength={3}
              placeholder="USD"
              className={inputCls + " uppercase"}
            />
          </Field>
          <Field label="Charge to">
            <select name="ownerChargeable" defaultValue="true" className={selectCls}>
              <option value="true">Owner</option>
              <option value="false">Operator</option>
            </select>
          </Field>
        </div>

        <Field label="Guest chargeable">
          <select name="guestChargeable" defaultValue="false" className={selectCls}>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </Field>

        <Field label="Description">
          <textarea name="description" rows={4} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
