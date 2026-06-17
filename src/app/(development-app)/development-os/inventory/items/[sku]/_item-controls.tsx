"use client";

/**
 * SKU-detail controls — Edit / Deactivate / Reactivate.
 *
 * Posts directly to the "use server" `updateInventoryItem` action
 * (inventory-actions.ts), which is org-scoped + audited. `sku` is the
 * immutable lookup handle and is shown read-only. No authority added
 * here; the action enforces requireInternalUser + requireOrgId.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";
import { Field, inputCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { updateInventoryItem } from "@/lib/development/server/inventory/inventory-actions";

export interface InventoryItemControlsProps {
  id: string;
  sku: string;
  displayName: string;
  description: string | null;
  category: string;
  unitOfMeasure: string;
  minimumStockLevel: string | null;
  reorderPoint: string | null;
  notes: string | null;
  isActive: boolean;
}

export function InventoryItemControls(props: InventoryItemControlsProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function toNumOrNull(raw: string): number | null {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    const displayName = String(formData.get("displayName") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const unitOfMeasure = String(formData.get("unitOfMeasure") ?? "").trim();
    const minimumStockLevel = toNumOrNull(
      String(formData.get("minimumStockLevel") ?? ""),
    );
    const reorderPoint = toNumOrNull(String(formData.get("reorderPoint") ?? ""));
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        await updateInventoryItem({
          id: props.id,
          displayName,
          description: description || null,
          category,
          unitOfMeasure,
          minimumStockLevel,
          reorderPoint,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save item.");
      }
    });
  }

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      try {
        await updateInventoryItem({ id: props.id, isActive: !props.isActive });
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to change item status.",
        );
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil className="w-4 h-4" strokeWidth={1.75} />
        Edit item
      </Button>
      <button
        type="button"
        onClick={toggleActive}
        disabled={pending}
        className={
          props.isActive
            ? "btn btn-secondary btn-sm"
            : "btn btn-dark btn-sm"
        }
      >
        {props.isActive
          ? pending
            ? "Deactivating…"
            : "Deactivate"
          : pending
            ? "Reactivating…"
            : "Reactivate"}
      </button>
      {error && (
        <span className="text-[11px] text-danger self-center">{error}</span>
      )}

      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${props.sku}`}
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
            <Field label="SKU" hint="Immutable lookup handle">
              <input
                value={props.sku}
                disabled
                readOnly
                className={inputCls}
              />
            </Field>
            <Field label="Display name" required>
              <input
                name="displayName"
                required
                defaultValue={props.displayName}
                className={inputCls}
              />
            </Field>
            <Field label="Category" required>
              <input
                name="category"
                required
                defaultValue={props.category}
                placeholder="finishing_materials"
                className={inputCls}
              />
            </Field>
            <Field label="Unit of measure" required>
              <input
                name="unitOfMeasure"
                required
                defaultValue={props.unitOfMeasure}
                placeholder="pcs / m² / bag"
                className={inputCls}
              />
            </Field>
            <Field label="Minimum stock level" hint="Optional safety stock">
              <input
                name="minimumStockLevel"
                type="number"
                min={0}
                step="any"
                defaultValue={props.minimumStockLevel ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Reorder point" hint="Triggers low-stock alert">
              <input
                name="reorderPoint"
                type="number"
                min={0}
                step="any"
                defaultValue={props.reorderPoint ?? ""}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              defaultValue={props.description ?? ""}
              className={textareaCls}
            />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              defaultValue={props.notes ?? ""}
              className={textareaCls}
            />
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
            <SubmitButton disabled={pending} pendingLabel="Saving…">
              Save changes
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
