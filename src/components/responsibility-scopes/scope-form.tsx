"use client";

import { useActionState } from "react";
import { FormShell, Field, selectCls, inputCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { createResponsibilityScopeAction } from "@/features/responsibility-scopes/actions";

const SCOPE_TYPES = [
  "operations",
  "housekeeping",
  "maintenance",
  "front_office",
  "security",
  "procurement",
  "finance",
] as const;

const TASK_CATEGORIES = [
  "housekeeping",
  "maintenance",
  "concierge",
  "inspection",
  "preventive",
  "security",
] as const;

export function ResponsibilityScopeForm({
  users,
  projects,
  villas,
}: {
  users: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  villas: { id: string; label: string }[];
}) {
  const [state, dispatch] = useActionState(createResponsibilityScopeAction, null);

  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            {state && state.ok && (
              <span className="text-xs text-success mr-auto">Created.</span>
            )}
            <SubmitButton>Create scope</SubmitButton>
          </>
        }
      >
        <Field label="User" required>
          <select name="userId" required className={selectCls} defaultValue="">
            <option value="">Select user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Scope type" required>
          <select name="scopeType" required className={selectCls} defaultValue="operations">
            {SCOPE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Project (optional — NULL = any)">
            <select name="projectId" className={selectCls} defaultValue="">
              <option value="">— any —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Villa (optional — NULL = any)">
            <select name="villaId" className={selectCls} defaultValue="">
              <option value="">— any —</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Task category (optional)">
            <select name="taskCategory" className={selectCls} defaultValue="">
              <option value="">— any —</option>
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role key (optional, free text)">
            <input
              type="text"
              name="roleKey"
              className={inputCls}
              maxLength={40}
              placeholder="e.g. property_manager"
            />
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
