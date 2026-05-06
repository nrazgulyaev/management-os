"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  createAssetType,
  updateAssetType,
} from "@/lib/development/server/assets/asset-type-actions";

/**
 * Stage 6.P0.6 — Asset Type CRUD modal.
 *
 * Per P0.2 carry-forward: the action file was flipped from
 * import "server-only" → "use server" in this checkpoint, and
 * updateAssetType was added alongside createAssetType +
 * deactivateAssetType. This modal handles both create and edit.
 *
 * Workflow verb: "Add asset type" / "Edit asset type".
 */

const CATEGORIES = [
  { value: "residential", label: "Residential" },
  { value: "hospitality", label: "Hospitality" },
  { value: "food_beverage", label: "Food & beverage" },
  { value: "wellness", label: "Wellness" },
  { value: "mixed_use", label: "Mixed-use" },
  { value: "commercial", label: "Commercial" },
  { value: "land", label: "Land" },
  { value: "amenity", label: "Amenity" },
  { value: "other", label: "Other" },
] as const;

export interface AssetTypeFormDefaults {
  id?: string;
  typeKey?: string;
  displayName?: string;
  description?: string | null;
  assetCategory?: string;
  isSaleable?: boolean;
  isRentable?: boolean;
  isRevenueGenerating?: boolean;
  iconKey?: string | null;
}

export function AssetTypeModalForm({
  defaults,
  triggerLabel,
  triggerIcon,
}: {
  defaults?: AssetTypeFormDefaults;
  triggerLabel?: string;
  triggerIcon?: "plus" | "pencil";
}) {
  const isEdit = !!defaults?.id;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const typeKey = String(formData.get("typeKey") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const assetCategory = String(formData.get("assetCategory") ?? "");
    const iconKey = String(formData.get("iconKey") ?? "").trim();
    const isSaleable = formData.get("isSaleable") === "on";
    const isRentable = formData.get("isRentable") === "on";
    const isRevenueGenerating = formData.get("isRevenueGenerating") === "on";

    startTransition(async () => {
      try {
        if (isEdit && defaults?.id) {
          await updateAssetType({
            id: defaults.id,
            displayName,
            description: description || null,
            assetCategory: assetCategory as never,
            iconKey: iconKey || null,
            isSaleable,
            isRentable,
            isRevenueGenerating,
          });
        } else {
          await createAssetType({
            typeKey,
            displayName,
            description: description || null,
            assetCategory: assetCategory as never,
            iconKey: iconKey || null,
            isSaleable,
            isRentable,
            isRevenueGenerating,
          });
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save asset type");
      }
    });
  }

  const Icon = triggerIcon === "pencil" || isEdit ? Pencil : Plus;
  const finalLabel = triggerLabel ?? (isEdit ? "Edit" : "Add asset type");

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant={isEdit ? "ghost" : "primary"}
        data-testid={isEdit ? "asset-type-edit-trigger" : "asset-type-add-trigger"}
      >
        <Icon className="w-4 h-4" strokeWidth={1.75} />
        {finalLabel}
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? `Edit ${defaults?.displayName ?? "asset type"}` : "Add asset type"}
        size="md"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              label="Type key"
              required={!isEdit}
              hint={isEdit ? "Immutable — used as the FK lookup key" : "lowercase snake_case"}
            >
              <input
                name="typeKey"
                required={!isEdit}
                pattern="[a-z0-9_]+"
                defaultValue={defaults?.typeKey}
                disabled={isEdit}
                placeholder="boutique_villa"
                className={inputCls}
              />
            </Field>
            <Field label="Display name" required>
              <input
                name="displayName"
                required
                defaultValue={defaults?.displayName}
                placeholder="Boutique villa"
                className={inputCls}
              />
            </Field>
            <Field label="Asset category" required>
              <select
                name="assetCategory"
                required
                defaultValue={defaults?.assetCategory ?? ""}
                className={selectCls}
              >
                <option value="" disabled>Select…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Icon key" hint="Lucide icon name (optional)">
              <input
                name="iconKey"
                defaultValue={defaults?.iconKey ?? ""}
                placeholder="Home"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              defaultValue={defaults?.description ?? ""}
              className={textareaCls}
            />
          </Field>
          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                name="isSaleable"
                type="checkbox"
                defaultChecked={defaults?.isSaleable ?? true}
                className="w-4 h-4"
              />
              <span>Saleable (can be sold to a buyer)</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                name="isRentable"
                type="checkbox"
                defaultChecked={defaults?.isRentable ?? false}
                className="w-4 h-4"
              />
              <span>Rentable (short-term lets, owner-stays)</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                name="isRevenueGenerating"
                type="checkbox"
                defaultChecked={defaults?.isRevenueGenerating ?? true}
                className="w-4 h-4"
              />
              <span>Revenue-generating (vs. amenity-only)</span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Saving…">
              {isEdit ? "Save changes" : "Add asset type"}
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
