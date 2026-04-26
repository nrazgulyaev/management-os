"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createPreventiveScheduleAction } from "@/features/operations/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

interface Option {
  id: string;
  label: string;
}

export function PreventiveScheduleForm({
  villas,
  projects,
  templates,
  appUsers,
  cancelHref,
}: {
  villas: Option[];
  projects: Option[];
  templates: Option[];
  appUsers: Option[];
  cancelHref: string;
}) {
  const [state, dispatch] = useActionState(createPreventiveScheduleAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.push("/dashboard/operations/preventive");
  }, [state, router]);

  return (
    <form action={dispatch}>
      <FormShell
        title="New preventive schedule"
        description="Recurring inspections and services. The runtime mints a new task each time the schedule comes due."
        footer={
          <>
            <Button asChild variant="ghost">
              <a href={cancelHref}>Cancel</a>
            </Button>
            <SubmitButton>Create schedule</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Name" required error={errs.name?.[0]}>
          <input name="name" required className={inputCls} placeholder="Pool service — weekly" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" required>
            <input name="category" defaultValue="maintenance" required className={inputCls} />
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
          <Field label="Villa" error={errs.villaId?.[0]}>
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
          <Field label="Frequency" required>
            <select name="frequency" defaultValue="weekly" className={selectCls}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Interval days" hint="Required when frequency = custom" error={errs.intervalDays?.[0]}>
            <input type="number" name="intervalDays" min={1} max={3650} className={inputCls} />
          </Field>
          <Field label="Next due on" required>
            <input type="date" name="nextDueOn" required className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Checklist template">
            <select name="checklistTemplateId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default assignee">
            <select name="assignedTo" defaultValue="" className={selectCls}>
              <option value="">— Unassigned</option>
              {appUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
