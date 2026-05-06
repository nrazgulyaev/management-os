"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createCostCategory } from "@/lib/development/server/cost-category-actions";

/**
 * Stage 6.P0.4 — modal-driven CRUD for cost categories.
 *
 * Wraps `createCostCategory` (server action) inside an EntityModal.
 * Triggers from the cost-categories list page via the "+ Add cost
 * category" button this component renders.
 *
 * Workflow-verb label per Q2/audit: "Add cost category".
 *
 * The action throws on validation failure — we surface the error
 * inline. The action returns `{ id, categoryCode }` on success;
 * we router.refresh() to pull the new row into the list.
 */

const CATEGORY_TYPES = [
  { value: "capex", label: "Capex (capital expenditure)" },
  { value: "opex", label: "Opex (operating expenditure)" },
  { value: "cogs", label: "COGS (cost of goods sold)" },
  { value: "fee_income", label: "Fee income" },
  { value: "sale_income", label: "Sale income" },
  { value: "rental_income", label: "Rental income" },
  { value: "corporate_event", label: "Corporate event" },
] as const;

export interface ParentCategoryOption {
  id: string;
  categoryCode: string;
  displayName: string;
}

export function CostCategoryModalForm({
  parents,
}: {
  parents: ParentCategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const code = String(formData.get("categoryCode") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const categoryType = String(formData.get("categoryType") ?? "");
    const parentCategoryId = String(formData.get("parentCategoryId") ?? "");
    const displayOrderRaw = String(formData.get("displayOrder") ?? "100");
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        await createCostCategory({
          categoryCode: code,
          displayName,
          categoryType: categoryType as never,
          parentCategoryId: parentCategoryId || null,
          displayOrder: Number(displayOrderRaw) || 100,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add cost category");
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        data-testid="cost-category-add-trigger"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add cost category
      </Button>

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Add cost category"
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
            <Field
              label="Code"
              required
              hint="UPPER_SNAKE_CASE; used as the stable lookup key"
            >
              <input
                name="categoryCode"
                required
                pattern="[A-Z0-9_]+"
                placeholder="LAND_PURCHASE"
                className={inputCls}
              />
            </Field>
            <Field label="Display name" required>
              <input
                name="displayName"
                required
                placeholder="Land purchase"
                className={inputCls}
              />
            </Field>
            <Field label="Category type" required>
              <select name="categoryType" required className={selectCls} defaultValue="">
                <option value="" disabled>
                  Select type…
                </option>
                {CATEGORY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Parent category"
              hint="Optional. Leave blank for top-level."
            >
              <select name="parentCategoryId" className={selectCls} defaultValue="">
                <option value="">— none —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.categoryCode})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Display order" hint="Lower = higher in lists">
              <input
                name="displayOrder"
                type="number"
                inputMode="numeric"
                defaultValue={100}
                min={0}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Notes" hint="Optional internal note">
            <textarea
              name="notes"
              rows={2}
              className={textareaCls}
              placeholder="Why this category, who proposed it, etc."
            />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Adding…">
              Add cost category
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
