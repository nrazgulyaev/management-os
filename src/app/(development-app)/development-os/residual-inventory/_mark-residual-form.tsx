"use client";

/**
 * "Mark unit as residual" modal.
 *
 * Posts to markUnitAsResidualAction (./_actions.ts) which wraps the
 * org-scoped server action — it re-verifies the project + unit belong to
 * the caller's org. Project + unit are picked from org-scoped lists handed
 * down by the server page; the unit picker narrows to the chosen project.
 * Valuation is entered in major units and converted to minor server-side.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { markUnitAsResidualAction } from "./_actions";

const VALUATION_METHODS = [
  { value: "current_market_value", label: "Current market value" },
  { value: "list_price", label: "List price" },
  { value: "conservative_liquidation_value", label: "Conservative liquidation" },
  { value: "internal_minimum_sale_price", label: "Internal minimum sale price" },
  { value: "rental_income_valuation", label: "Rental income valuation" },
  { value: "manual_valuation", label: "Manual valuation" },
] as const;

export interface ResidualProjectOption {
  id: string;
  label: string;
}
export interface ResidualUnitOption {
  id: string;
  projectId: string;
  label: string;
}

export function MarkResidualForm({
  projects,
  units,
}: {
  projects: ResidualProjectOption[];
  units: ResidualUnitOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [projectId, setProjectId] = React.useState("");

  const unitsForProject = React.useMemo(
    () => units.filter((u) => u.projectId === projectId),
    [units, projectId],
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    const unitId = String(formData.get("unitId") ?? "").trim();
    const activeValuationMethod = String(
      formData.get("activeValuationMethod") ?? "",
    );
    const activeValuationMajor = String(
      formData.get("activeValuationMajor") ?? "",
    ).trim();
    const activationReason = String(formData.get("activationReason") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!projectId) {
      setError("Pick a project.");
      return;
    }
    if (!unitId) {
      setError("Pick a unit.");
      return;
    }

    startTransition(async () => {
      const r = await markUnitAsResidualAction({
        unitId,
        projectId,
        activeValuationMethod,
        activeValuationMajor,
        activationReason: activationReason || null,
        notes: notes || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setProjectId("");
      router.refresh();
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
          setProjectId("");
          setOpen(true);
        }}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Mark unit as residual
      </Button>

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Mark unit as residual"
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
          <p className="text-sm text-ink-secondary">
            When a project completes without a full sellout, mark its unsold
            units as residual. Ownership shares are allocated afterwards from
            the unit&apos;s detail page.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Project" required>
              <select
                name="projectId"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={selectCls}
              >
                <option value="" disabled>
                  Select…
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit" required hint="Units in the selected project">
              <select
                name="unitId"
                required
                defaultValue=""
                disabled={!projectId}
                className={selectCls}
              >
                <option value="" disabled>
                  {projectId ? "Select…" : "Pick a project first"}
                </option>
                {unitsForProject.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valuation method" required>
              <select
                name="activeValuationMethod"
                required
                defaultValue="current_market_value"
                className={selectCls}
              >
                {VALUATION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valuation (USD)" required>
              <input
                name="activeValuationMajor"
                type="number"
                min={0}
                step="any"
                required
                placeholder="450000"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Activation reason" hint="Why did this unit become residual?">
            <input
              name="activationReason"
              placeholder="Unsold at project completion"
              className={inputCls}
            />
          </Field>
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
            <SubmitButton disabled={pending} pendingLabel="Marking…">
              Mark as residual
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
