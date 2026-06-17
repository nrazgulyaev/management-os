"use client";

/**
 * New inventory location modal.
 *
 * Posts directly to the dev-OS "use server" `createInventoryLocation`
 * (inventory-actions.ts) — NOT the @/features inventory action. The
 * action enforces requireInternalUser + requireOrgId and stamps the
 * caller's org; project is optional (warehouses/virtual buckets have
 * none, sites pin to a project). No client-supplied organizationId.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { createInventoryLocation } from "@/lib/development/server/inventory/inventory-actions";

const LOCATION_TYPES = [
  { value: "warehouse", label: "Warehouse" },
  { value: "site", label: "Site" },
  { value: "in_transit", label: "In transit (virtual)" },
  { value: "consumed", label: "Consumed (virtual)" },
  { value: "damaged", label: "Damaged (virtual)" },
  { value: "returned", label: "Returned (virtual)" },
] as const;

export interface LocationProjectOption {
  id: string;
  label: string;
}

export function NewLocationForm({
  projects,
}: {
  projects: LocationProjectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const locationCode = String(formData.get("locationCode") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const locationType = String(formData.get("locationType") ?? "");
    const projectId = String(formData.get("projectId") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        await createInventoryLocation({
          locationCode,
          displayName,
          locationType: locationType as never,
          projectId: projectId || null,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create location.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        New location
      </Button>

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="New inventory location"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Location code" required hint="Short unique handle">
              <input
                name="locationCode"
                required
                placeholder="WH-MAIN"
                className={inputCls}
              />
            </Field>
            <Field label="Display name" required>
              <input
                name="displayName"
                required
                placeholder="Main warehouse"
                className={inputCls}
              />
            </Field>
            <Field label="Type" required>
              <select
                name="locationType"
                required
                defaultValue="warehouse"
                className={selectCls}
              >
                {LOCATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project" hint="Optional — pin a site to a project">
              <select name="projectId" defaultValue="" className={selectCls}>
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={textareaCls} />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Creating…">
              Create location
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
