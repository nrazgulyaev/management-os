"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { runPayrollAction } from "@/features/payroll/actions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * "Run payroll for <month>" control. Posts one expense line per active staff
 * member through the finance pipeline. Idempotent server-side (one run per
 * org+month); the button surfaces the real result, not a fake success.
 */
export function RunPayroll({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    runPayrollAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex items-end gap-2 flex-wrap">
      <input type="hidden" name="periodMonth" value={`${month}-01`} />
      <label className="flex flex-col gap-1">
        <span className="label">Payroll month</span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] border border-line rounded-md bg-paper"
        />
      </label>
      <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Run payroll"}
      </button>
      {state && !state.ok && (
        <span className="text-[12px] text-danger self-center">{state.error}</span>
      )}
      {state && state.ok && (
        <span className="text-[12px] text-ok self-center">Payroll posted to finance.</span>
      )}
    </form>
  );
}
