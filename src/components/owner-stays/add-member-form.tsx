"use client";

import { useActionState } from "react";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { addEquivalenceMemberAction } from "@/features/owner-stays/actions";

export function AddEquivalenceMemberForm({
  groupId,
  villas,
}: {
  groupId: string;
  villas: { id: string; label: string }[];
}) {
  const [state, dispatch] = useActionState(addEquivalenceMemberAction, null);
  if (villas.length === 0) {
    return (
      <p className="text-xs text-ink-tertiary mt-3">
        Every villa is already in this group.
      </p>
    );
  }
  return (
    <form action={dispatch} className="mt-4">
      <input type="hidden" name="groupId" value={groupId} />
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <SubmitButton>Add member</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <Field label="Quality rank (lower = better)">
            <input
              type="number"
              name="qualityRank"
              min={0}
              max={1000}
              defaultValue={100}
              className={inputCls}
            />
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
