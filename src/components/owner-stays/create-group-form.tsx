"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createEquivalenceGroupAction } from "@/features/owner-stays/actions";

export function CreateGroupForm({
  projects,
}: {
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(createEquivalenceGroupAction, null);

  useEffect(() => {
    if (state?.ok && state.groupId) {
      router.push("/dashboard/owner-stays/equivalence-groups");
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
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <SubmitButton>Create group</SubmitButton>
          </>
        }
      >
        <Field label="Name" required>
          <input type="text" name="name" required maxLength={160} className={inputCls} />
        </Field>
        <Field label="Project (optional)">
          <select name="projectId" className={selectCls} defaultValue="">
            <option value="">— global —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea name="description" rows={3} maxLength={500} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
