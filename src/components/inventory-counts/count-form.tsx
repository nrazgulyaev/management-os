"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createInventoryCountAction } from "@/features/inventory/counts-actions";
import type { ActionResult } from "@/features/projects/actions";

interface Option {
  id: string;
  label: string;
}

const initial: ActionResult | null = null;

export function NewInventoryCountForm({
  locations,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  locations: Option[];
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createInventoryCountAction, initial);
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
        title="Start a stock count"
        description="Lines are pre-filled from the location's current stock; counters overwrite the counted column."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            ) : (
              <Button asChild variant="ghost"><a href={cancelHref}>Cancel</a></Button>
            )}
            <SubmitButton>Start count</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Location" required>
          <select name="locationId" defaultValue="" required className={selectCls}>
            <option value="" disabled>Pick a location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea name="notes" rows={3} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
