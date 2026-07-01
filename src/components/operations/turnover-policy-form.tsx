"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormShell, Field, inputCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { updateTurnoverPolicyAction } from "@/features/operations/turnover-policy-actions";
import type { TurnoverPolicy } from "@/features/operations/turnover-policy";

/**
 * Org-level turnover-times policy editor. Pre-filled with the current policy
 * (or the code defaults when the org has no row yet). Submits to
 * updateTurnoverPolicyAction (operations.write + org-scoped). Mirrors
 * OwnerStayPolicyForm's useActionState pattern.
 */
export function TurnoverPolicyForm({ policy }: { policy: TurnoverPolicy }) {
  const router = useRouter();
  const [state, dispatch] = useActionState(updateTurnoverPolicyAction, null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setSaved(true);
      router.refresh();
      const t = setTimeout(() => setSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            {saved && (
              <span className="text-xs text-success mr-auto">Policy saved.</span>
            )}
            <SubmitButton>Save policy</SubmitButton>
          </>
        }
      >
        <p className="text-[13px] text-ink-3 max-w-[560px]">
          The house-standard turnover clock for your company. These times drive
          the turnover board window and the same-day cleaning SLA. They are the
          default for every villa — a guest&apos;s actual arrival/departure can
          still differ per booking.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Standard check-out time" required>
            <input
              type="time"
              name="checkoutTime"
              required
              defaultValue={policy.checkoutTime}
              className={inputCls}
            />
          </Field>
          <Field label="Standard check-in time" required>
            <input
              type="time"
              name="checkinTime"
              required
              defaultValue={policy.checkinTime}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Minimum turnover window (minutes)" required>
          <input
            type="number"
            name="minTurnoverMinutes"
            min={0}
            max={1440}
            required
            defaultValue={policy.minTurnoverMinutes}
            className={inputCls}
          />
        </Field>
      </FormShell>
    </form>
  );
}
