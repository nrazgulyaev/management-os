"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setStaffActiveAction } from "@/features/payroll/actions";
import type { ActionResult } from "@/features/projects/actions";

export function StaffRowActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    setStaffActiveAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="flex items-center gap-2 justify-end">
      <Link href={`/dashboard/payroll/${id}/edit`} className="btn btn-ghost btn-sm">
        Edit
      </Link>
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={pending}>
          {pending ? "…" : active ? "Deactivate" : "Reactivate"}
        </button>
      </form>
      {state && !state.ok && <span className="text-[11px] text-danger">{state.error}</span>}
    </div>
  );
}
