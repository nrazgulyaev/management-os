"use client";

import { useActionState } from "react";
import {
  FormShell,
  Field,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { setVillaReadinessAction } from "@/features/readiness/actions";

const STATUSES = [
  "unknown",
  "dirty",
  "cleaning",
  "inspection",
  "ready",
  "occupied",
  "maintenance_block",
  "out_of_order",
] as const;

export function ReadinessSetForm({
  villas,
}: {
  villas: { id: string; label: string }[];
}) {
  const [state, dispatch] = useActionState(setVillaReadinessAction, null);

  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            {state && state.ok && (
              <span className="text-xs text-success mr-auto">Saved.</span>
            )}
            <SubmitButton>Set readiness</SubmitButton>
          </>
        }
      >
        <Field label="Villa" required>
          <select name="villaId" required className={selectCls} defaultValue="">
            <option value="">Select villa…</option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status" required>
          <select
            name="readinessStatus"
            required
            className={selectCls}
            defaultValue=""
          >
            <option value="">Select…</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={2}
            maxLength={400}
            className={textareaCls}
            placeholder="Optional context for the audit log."
          />
        </Field>
      </FormShell>
    </form>
  );
}
