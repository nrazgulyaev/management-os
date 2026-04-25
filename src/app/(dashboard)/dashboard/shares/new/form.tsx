"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createShareAction } from "@/features/shares/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

export function ShareForm({
  owners,
  projects,
  villas,
}: {
  owners: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  villas: { id: string; label: string }[];
}) {
  const [state, dispatch] = useActionState(createShareAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const [model, setModel] = useState<"individual" | "pooled" | "hybrid">("individual");

  return (
    <form action={dispatch}>
      <FormShell
        title="Share details"
        description="Active shares for the same villa or pool must total exactly 100%. The platform warns when they don't."
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/shares">Cancel</Link>
            </Button>
            <SubmitButton>Create share</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Owner" required error={errs.ownerId?.[0]}>
            <select name="ownerId" required defaultValue="" className={selectCls}>
              <option value="" disabled>
                Pick an owner
              </option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Model"
            required
            hint="individual = one owner per villa · pooled = shared yield across project · hybrid = villa-specific revenue with shared costs"
          >
            <select
              name="model"
              defaultValue="individual"
              onChange={(e) => setModel(e.target.value as typeof model)}
              className={selectCls}
            >
              <option value="individual">Individual (villa)</option>
              <option value="pooled">Pooled (project)</option>
              <option value="hybrid">Hybrid (villa)</option>
            </select>
          </Field>
        </div>

        {model === "pooled" ? (
          <Field label="Project" required error={errs.projectId?.[0]}>
            <select name="projectId" required defaultValue="" className={selectCls}>
              <option value="" disabled>
                Pick a project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input type="hidden" name="villaId" value="" />
          </Field>
        ) : (
          <Field label="Villa" required error={errs.villaId?.[0]}>
            <select name="villaId" required defaultValue="" className={selectCls}>
              <option value="" disabled>
                Pick a villa
              </option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <input type="hidden" name="projectId" value="" />
          </Field>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Share %" required hint="Max 100" error={errs.sharePercent?.[0]}>
            <input
              name="sharePercent"
              type="number"
              required
              min={0.000001}
              max={100}
              step="0.000001"
              className={inputCls}
              placeholder="100"
            />
          </Field>
          <Field label="Effective from" required error={errs.startsOn?.[0]}>
            <input name="startsOn" type="date" required className={inputCls} />
          </Field>
          <Field label="Ends on">
            <input name="endsOn" type="date" className={inputCls} />
          </Field>
        </div>

        <Field label="Status" required>
          <select name="status" defaultValue="active" className={selectCls}>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="ended">Ended</option>
          </select>
        </Field>
      </FormShell>
    </form>
  );
}
