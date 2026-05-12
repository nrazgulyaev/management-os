"use client";

import Link from "next/link";
import { Field, FormShell, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { generateOwnerStatementAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";

export function GenerateStatementForm({
  owners,
  villas,
  projects,
  periods,
  onSuccess,
  onCancel,
}: {
  owners: { id: string; label: string }[];
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  periods: { id: string; label: string }[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    generateOwnerStatementAction,
    { onSuccess },
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={submitAction}>
      <FormShell
        title="Statement scope"
        description="Pick the owner + period. Optional villa / project filters constrain the scope."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/dashboard/finance/statements">Cancel</Link>
              </Button>
            )}
            <SubmitButton>Generate statement</SubmitButton>
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
          <Field label="Period" required error={errs.periodId?.[0]}>
            <select name="periodId" required defaultValue="" className={selectCls}>
              <option value="" disabled>
                Pick a period
              </option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Villa (optional)">
            <select name="villaId" defaultValue="" className={selectCls}>
              <option value="">All</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (optional)">
            <select name="projectId" defaultValue="" className={selectCls}>
              <option value="">All</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency">
            <select name="currency" defaultValue="USD" className={selectCls}>
              {["USD", "IDR", "EUR", "GBP"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
