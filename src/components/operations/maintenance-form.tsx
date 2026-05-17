"use client";

import Link from "next/link";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createMaintenanceTicketAction } from "@/features/operations/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function MaintenanceTicketForm({
  villas,
  projects,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  villas: Option[];
  projects: Option[];
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createMaintenanceTicketAction, initial);
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
        title="New maintenance ticket"
        description="A ticket can later be linked to a generated repair task."
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
            <SubmitButton>Open ticket</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Title" required error={errs.title?.[0]}>
          <input name="title" required className={inputCls} placeholder="AC unit not cooling — bedroom 2" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Issue category" required>
            <select name="issueCategory" defaultValue="ac" className={selectCls}>
              <option value="electrical">Electrical</option>
              <option value="plumbing">Plumbing</option>
              <option value="ac">AC</option>
              <option value="pool">Pool</option>
              <option value="internet">Internet</option>
              <option value="furniture">Furniture</option>
              <option value="appliance">Appliance</option>
              <option value="structural">Structural</option>
              <option value="landscaping">Landscaping</option>
              <option value="pest">Pest</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Severity">
            <select name="severity" defaultValue="normal" className={selectCls}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Villa">
            <select name="villaId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select name="projectId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Estimated cost (minor units)" hint="e.g. USD 12.34 → 1234">
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
          <Field label="Owner chargeable">
            <select name="ownerChargeable" defaultValue="true" className={selectCls}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
        </div>

        <Field label="Description">
          <textarea name="description" rows={4} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
