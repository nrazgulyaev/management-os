"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createStatementPeriodAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

export function PeriodForm() {
  const [state, dispatch] = useActionState(createStatementPeriodAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={dispatch}>
      <FormShell
        title="Period details"
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/finance/periods">Cancel</Link>
            </Button>
            <SubmitButton>Create period</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Label" required hint="e.g. April 2026" error={errs.label?.[0]}>
          <input name="label" required className={inputCls} placeholder="April 2026" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Period start" required error={errs.periodStart?.[0]}>
            <input name="periodStart" type="date" required className={inputCls} />
          </Field>
          <Field label="Period end" required error={errs.periodEnd?.[0]}>
            <input name="periodEnd" type="date" required className={inputCls} />
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
