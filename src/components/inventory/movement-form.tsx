"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createInventoryMovementAction } from "@/features/inventory/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function MovementForm({
  items,
  locations,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  items: Option[];
  locations: Option[];
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createInventoryMovementAction, initial);
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
        title="New stock movement"
        description="Receive, consume, transfer, adjust, write-off, or return to supplier."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            ) : (
              <Button asChild variant="ghost"><a href={cancelHref}>Cancel</a></Button>
            )}
            <SubmitButton>Apply movement</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Item" required error={errs.itemId?.[0]}>
          <select name="itemId" defaultValue="" required className={selectCls}>
            <option value="" disabled>Pick an item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Movement type" required>
            <select name="movementType" defaultValue="receive" className={selectCls}>
              <option value="receive">Receive</option>
              <option value="consume">Consume</option>
              <option value="transfer">Transfer</option>
              <option value="adjust">Adjust (signed)</option>
              <option value="count_correction">Count correction (signed)</option>
              <option value="damage">Damage</option>
              <option value="write_off">Write-off</option>
              <option value="return_to_supplier">Return to supplier</option>
            </select>
          </Field>
          <Field label="Quantity" required>
            <input
              type="number"
              step={0.001}
              name="quantity"
              required
              className={inputCls}
              placeholder="positive (or signed for adjust/count_correction)"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="From location">
            <select name="fromLocationId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </Field>
          <Field label="To location">
            <select name="toLocationId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Reason / notes">
          <textarea name="reason" rows={3} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
