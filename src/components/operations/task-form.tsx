"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createOperationTaskAction } from "@/features/operations/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function TaskForm({
  villas,
  projects,
  appUsers,
  templates,
  cancelHref,
  defaultCategory = "housekeeping",
  onSuccess,
  onCancel,
}: {
  villas: Option[];
  projects: Option[];
  appUsers: Option[];
  templates: Option[];
  cancelHref: string;
  defaultCategory?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createOperationTaskAction, initial);
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
        title="New operations task"
        description="Tasks materialise into the field workflow once assigned."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <a href={cancelHref}>Cancel</a>
              </Button>
            )}
            <SubmitButton>Create task</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Title" required error={errs.title?.[0]}>
          <input name="title" required className={inputCls} placeholder="Deep clean villa EV-07" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" required>
            <select name="category" defaultValue={defaultCategory} className={selectCls}>
              <option value="housekeeping">Housekeeping</option>
              <option value="maintenance">Maintenance</option>
              <option value="inspection">Inspection</option>
              <option value="guest_request">Guest request</option>
              <option value="procurement">Procurement</option>
              <option value="admin">Admin</option>
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

        <div className="grid grid-cols-2 gap-4">
          <Field label="Assign to">
            <select name="assignedTo" defaultValue="" className={selectCls}>
              <option value="">— Unassigned</option>
              {appUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Checklist template">
            <select name="templateId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Scheduled for">
            <input type="date" name="scheduledFor" className={inputCls} />
          </Field>
          <Field label="Estimated minutes">
            <input
              type="number"
              name="estimatedMinutes"
              min={1}
              max={1440}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea name="description" rows={3} className={textareaCls} />
        </Field>

        <Field label="Internal notes" hint="Visible to internal staff only">
          <textarea name="internalNotes" rows={2} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
