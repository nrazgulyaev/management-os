"use client";

/**
 * Wire-up sweep — create service request. createServiceRequestAction
 * existed (useActionState shape, service_request.write) but had no create
 * UI. Mirrors damage-form.tsx.
 */

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createServiceRequestAction } from "@/features/operations/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

const REQUEST_TYPES = [
  "cleaning",
  "laundry",
  "transfer",
  "breakfast",
  "massage",
  "private_chef",
  "maintenance",
  "concierge",
  "other",
] as const;

export function ServiceRequestForm({
  villas,
  defaultVillaId,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  villas: Option[];
  defaultVillaId?: string;
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createServiceRequestAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (onSuccess) onSuccess();
      else router.push(cancelHref);
    }
  }, [state, router, onSuccess, cancelHref]);

  return (
    <form action={dispatch}>
      <FormShell
        title="New service request"
        description="Guest or operational service request. Routes into the operations queue."
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
            <SubmitButton>Create request</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Title" required error={errs.title?.[0]}>
          <input name="title" required className={inputCls} placeholder="Extra towels for villa A2" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" error={errs.requestType?.[0]}>
            <select name="requestType" defaultValue="other" className={selectCls}>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority" defaultValue="normal" className={selectCls}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        </div>

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
          <Field label="Preferred time">
            <input name="preferredTime" className={inputCls} placeholder="e.g. tomorrow 10:00" />
          </Field>
        </div>

        <Field label="Message">
          <textarea name="message" rows={4} className={textareaCls} placeholder="Details…" />
        </Field>
      </FormShell>
    </form>
  );
}
