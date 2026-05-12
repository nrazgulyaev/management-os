"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FormShell, Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createVillaCalendarBlockAction } from "@/features/availability/actions";
import { BLOCKING_BLOCK_TYPES } from "@/features/availability/calendar";

const MANUAL_BLOCK_TYPES = BLOCKING_BLOCK_TYPES.filter(
  (t) => t !== "guest_booking" && t !== "channel_hold",
);

export function CalendarBlockForm({
  villas,
  onSuccess,
  onCancel,
}: {
  villas: { id: string; label: string }[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(createVillaCalendarBlockAction, null);

  useEffect(() => {
    if (state?.ok && state.blockId) {
      if (onSuccess) onSuccess();
      else router.push("/dashboard/availability/blocks");
    }
  }, [state, router, onSuccess]);

  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => (onCancel ? onCancel() : router.back())}
            >
              Cancel
            </Button>
            <SubmitButton>Create block</SubmitButton>
          </>
        }
      >
        <Field label="Villa" required>
          <select name="villaId" required className={selectCls} defaultValue="">
            <option value="">Select villa…</option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Block type" required>
          <select name="blockType" required className={selectCls} defaultValue="">
            <option value="">Select type…</option>
            {MANUAL_BLOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Starts at" required>
            <input type="datetime-local" name="startsAt" required className={inputCls} />
          </Field>
          <Field label="Ends at" required>
            <input type="datetime-local" name="endsAt" required className={inputCls} />
          </Field>
        </div>

        <Field label="Title" required>
          <input
            type="text"
            name="title"
            required
            maxLength={160}
            className={inputCls}
            placeholder="e.g. Quarterly AC service"
          />
        </Field>

        <Field label="Description">
          <textarea name="description" rows={3} maxLength={1000} className={textareaCls} />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ownerVisible" />
            Visible to owner
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="guestVisible" />
            Visible to guest
          </label>
        </div>
      </FormShell>
    </form>
  );
}
