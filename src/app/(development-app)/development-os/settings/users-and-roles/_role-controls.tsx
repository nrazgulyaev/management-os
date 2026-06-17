"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { grantRoleScoped, revokeRoleScoped } from "./_actions";

/**
 * Grant + revoke controls for the Users & roles admin surface.
 *
 * Both call the org-scoped co-located adapters in _actions.ts (which
 * verify the target user / role belongs to the caller's org before
 * delegating to the underlying role actions). Users are pre-loaded
 * server-side and scoped to the current org.
 */

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "marketing_staff", label: "Marketing staff" },
  { value: "qs_analyst", label: "QS analyst" },
  { value: "procurement_manager", label: "Procurement manager" },
  { value: "warehouse_manager", label: "Warehouse manager" },
  { value: "site_supervisor", label: "Site supervisor" },
  { value: "sales_manager", label: "Sales manager" },
  { value: "project_manager", label: "Project manager" },
  { value: "cfo_accountant", label: "CFO / accountant" },
  { value: "executive_ceo", label: "Executive / CEO" },
  { value: "admin", label: "Admin" },
];

export function GrantRoleModalForm({
  users,
}: {
  users: Array<{ id: string; email: string; fullName: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const userId = String(formData.get("userId") ?? "");
    const roleKey = String(formData.get("roleKey") ?? "");
    const scope = String(formData.get("scope") ?? "company_wide");
    const isPrimary = formData.get("isPrimary") === "on";

    if (!userId) {
      setError("Select a user.");
      return;
    }

    startTransition(async () => {
      const result = await grantRoleScoped({
        userId,
        // The server adapter re-validates roleKey against the RoleKey enum.
        roleKey: roleKey as Parameters<typeof grantRoleScoped>[0]["roleKey"],
        scope: scope as "company_wide" | "project_specific",
        isPrimary,
      });
      if (!result.ok) {
        setError(result.error ?? "Grant failed");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={users.length === 0}
        data-testid="role-grant-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Grant role
      </Button>
      <EntityModal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Grant role"
        description="Assign a cabinet role to a user in this organization. A user may hold one primary role plus additional secondary roles."
        size="md"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <Field label="User" required>
            <select name="userId" required className={selectCls} defaultValue="">
              <option value="" disabled>
                Select a user…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} · {u.email}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Role" required>
              <select name="roleKey" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select a role…
                </option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scope" required>
              <select name="scope" defaultValue="company_wide" className={selectCls}>
                <option value="company_wide">Company-wide</option>
                <option value="project_specific">Project-specific</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPrimary" />
            <span>Set as primary role (drives the user&rsquo;s landing cabinet)</span>
          </label>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Granting…">
              Grant role
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}

export function RevokeRoleButton({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await revokeRoleScoped({ roleId });
      if (result.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(result.error ?? "Revoke failed");
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="text-xs text-danger hover:underline disabled:opacity-50"
        data-testid={`role-revoke-${roleId}`}
      >
        {pending && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
        {confirming ? "Confirm revoke" : "Revoke"}
      </button>
      {confirming && !pending && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-ink-3 hover:underline"
        >
          Cancel
        </button>
      )}
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </span>
  );
}
