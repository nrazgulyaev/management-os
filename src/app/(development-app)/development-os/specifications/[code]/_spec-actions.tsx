"use client";

/**
 * Wire-up (dev-OS engineering-doc lifecycles §3) — specification lifecycle
 * controls. `deactivateSpecification` + `supersedeSpecification` existed
 * server-side (both org-scoped + permission-gated) but had ZERO UI triggers,
 * so a spec could never be retired or replaced.
 *
 * - Deactivate: flips `is_active = false` (confirm only).
 * - Supersede: opens a modal collecting the full replacement-spec fields
 *   (same shape as the create form), then atomically creates the new spec
 *   and marks the old one inactive + `superseded_by`.
 *
 * The server actions are the authority; this island only posts to them and
 * refreshes. Both live in a "use server" file so they're imported directly.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deactivateSpecification,
  supersedeSpecification,
} from "@/lib/development/server/specifications/specification-actions";

const CATEGORIES = [
  "wall_finish",
  "floor_finish",
  "ceiling_finish",
  "paint",
  "tile",
  "stone",
  "wood",
  "metal",
  "glass",
  "plumbing_fixture",
  "electrical_fixture",
  "lighting",
  "door_window",
  "hardware",
  "appliance",
  "furniture",
  "landscape",
  "pool",
  "mep",
  "structural",
  "other",
] as const;

type SpecCategory = (typeof CATEGORIES)[number];

export function SpecificationLifecycleActions({
  specId,
  isActive,
  defaultCategory,
}: {
  specId: string;
  isActive: boolean;
  defaultCategory: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Replacement-spec fields (mirror the create schema).
  const [specCode, setSpecCode] = useState("");
  const [specName, setSpecName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SpecCategory>(
    (CATEGORIES as readonly string[]).includes(defaultCategory)
      ? (defaultCategory as SpecCategory)
      : "wall_finish",
  );
  const [brand, setBrand] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [colorCode, setColorCode] = useState("");

  function deactivate() {
    if (!confirm("Deactivate this specification? It can no longer be selected on new BOQ items.")) return;
    setErr(null);
    start(async () => {
      try {
        await deactivateSpecification({ id: specId });
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Deactivate failed.");
      }
    });
  }

  function supersede(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!specCode.trim() || !specName.trim() || !description.trim()) {
      setErr("Replacement code, name, and description are required.");
      return;
    }
    start(async () => {
      try {
        const created = await supersedeSpecification({
          oldSpecificationId: specId,
          newSpecInput: {
            specCode: specCode.trim(),
            specName: specName.trim(),
            description: description.trim(),
            specCategory: category,
            brand: brand || null,
            modelNumber: modelNumber || null,
            colorCode: colorCode || null,
          },
        });
        setShowModal(false);
        router.push(
          `/development-os/specifications/${encodeURIComponent(created.specCode)}`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Supersede failed.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErr(null);
            setShowModal(true);
          }}
          className="text-[11px] px-2 py-0.5 rounded border bg-surface border-ink/30 text-ink hover:bg-muted/50 disabled:opacity-50"
        >
          Supersede
        </button>
        {isActive && (
          <button
            type="button"
            disabled={pending}
            onClick={deactivate}
            className="text-[11px] px-2 py-0.5 rounded border bg-surface border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-50"
          >
            {pending ? "…" : "Deactivate"}
          </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg border border-line-soft bg-surface p-5 shadow-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-medium mb-1">Supersede specification</h3>
            <p className="text-xs text-ink-tertiary mb-4">
              Create the replacement spec. This spec will be marked inactive and
              linked to the new one.
            </p>
            <form onSubmit={supersede} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-ink-secondary">Spec code</span>
                  <input
                    type="text"
                    value={specCode}
                    onChange={(e) => setSpecCode(e.target.value)}
                    placeholder="SPEC-MICROCEMENT-V4"
                    className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-secondary">Category</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SpecCategory)}
                    className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-ink-secondary">Spec name</span>
                <input
                  type="text"
                  value={specName}
                  onChange={(e) => setSpecName(e.target.value)}
                  placeholder="Microcement Warm Taupe V4"
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  required
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block text-sm">
                  <span className="text-ink-secondary">Brand</span>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-secondary">Model #</span>
                  <input
                    type="text"
                    value={modelNumber}
                    onChange={(e) => setModelNumber(e.target.value)}
                    className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-secondary">Color</span>
                  <input
                    type="text"
                    value={colorCode}
                    onChange={(e) => setColorCode(e.target.value)}
                    className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  />
                </label>
              </div>
              {err && <p className="text-xs text-danger">{err}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="text-xs px-3 py-1.5 rounded border bg-surface border-ink/30 text-ink hover:bg-muted/50 disabled:opacity-50"
                >
                  {pending ? "Superseding…" : "Create & supersede"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowModal(false)}
                  className="text-xs px-3 py-1.5 rounded border bg-surface border-line-soft text-ink-secondary hover:bg-muted/40 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {err && !showModal && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
