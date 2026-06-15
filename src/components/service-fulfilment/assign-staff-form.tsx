"use client";

import { Field, FormShell, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { assignFulfilmentStaffAction } from "@/features/service-fulfilment/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface StaffOption {
  id: string;
  label: string;
}

/**
 * Assign an internal staff member to a fulfilment. Backed by
 * `assignFulfilmentStaffAction` (perm `service_fulfilment.dispatch`,
 * org-scoped). Posts the exact `assignFulfilmentStaffSchema` fields:
 * `id` (fulfilment id, hidden) and `appUserId`.
 */
export function AssignStaffForm({
  fulfilmentId,
  staff,
  onSuccess,
  onCancel,
}: {
  fulfilmentId: string;
  staff: StaffOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    assignFulfilmentStaffAction,
    { onSuccess },
  );

  return (
    <form action={submitAction}>
      <input type="hidden" name="id" value={fulfilmentId} />
      <FormShell
        title="Assign staff"
        footer={
          <>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={pending}
              >
                Cancel
              </Button>
            )}
            <SubmitButton>Assign staff</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Staff member" required>
          <select name="appUserId" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              Select staff…
            </option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
      </FormShell>
    </form>
  );
}
