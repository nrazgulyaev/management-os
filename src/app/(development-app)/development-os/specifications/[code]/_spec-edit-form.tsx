"use client";

/**
 * Specification edit form. The create form (`specifications/new`) only
 * collects a thin subset (code / name / description / category / brand /
 * model / color). This island lets an operator fill in the rich fields —
 * dimensions, finish type, applicable standards, tolerance
 * specifications, preferred vendor, and notes — that the spec detail
 * already renders but had no way to set after creation.
 *
 * `updateSpecification` is org-scoped + permission-gated server-side and
 * lives in a "use server" module, so this client island imports it
 * directly. Pattern mirrors the supersede modal in `_spec-actions.tsx`.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateSpecification } from "@/lib/development/server/specifications/specification-actions";

interface VendorOption {
  id: string;
  label: string;
}

export function SpecificationEditForm({
  specId,
  defaults,
  vendors,
}: {
  specId: string;
  defaults: {
    specName: string;
    description: string;
    brand: string | null;
    modelNumber: string | null;
    colorCode: string | null;
    dimensions: string | null;
    finishType: string | null;
    applicableStandards: string[] | null;
    toleranceSpecifications: string | null;
    preferredVendorId: string | null;
    notes: string | null;
  };
  vendors: VendorOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [specName, setSpecName] = useState(defaults.specName);
  const [description, setDescription] = useState(defaults.description);
  const [brand, setBrand] = useState(defaults.brand ?? "");
  const [modelNumber, setModelNumber] = useState(defaults.modelNumber ?? "");
  const [colorCode, setColorCode] = useState(defaults.colorCode ?? "");
  const [dimensions, setDimensions] = useState(defaults.dimensions ?? "");
  const [finishType, setFinishType] = useState(defaults.finishType ?? "");
  const [standards, setStandards] = useState(
    (defaults.applicableStandards ?? []).join("\n"),
  );
  const [tolerances, setTolerances] = useState(
    defaults.toleranceSpecifications ?? "",
  );
  const [preferredVendorId, setPreferredVendorId] = useState(
    defaults.preferredVendorId ?? "",
  );
  const [notes, setNotes] = useState(defaults.notes ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!specName.trim() || !description.trim()) {
      setErr("Name and description are required.");
      return;
    }
    start(async () => {
      try {
        const applicableStandards = standards
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        await updateSpecification({
          id: specId,
          specName: specName.trim(),
          description: description.trim(),
          brand: brand.trim() || null,
          modelNumber: modelNumber.trim() || null,
          colorCode: colorCode.trim() || null,
          dimensions: dimensions.trim() || null,
          finishType: finishType.trim() || null,
          applicableStandards,
          toleranceSpecifications: tolerances.trim() || null,
          preferredVendorId: preferredVendorId || null,
          notes: notes.trim() || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Update failed.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border bg-surface border-ink/30 text-ink hover:bg-muted/50"
      >
        <Pencil className="w-3 h-3" strokeWidth={1.75} />
        Edit details
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-line-soft bg-surface p-5 shadow-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-medium mb-1">Edit specification details</h3>
        <p className="text-xs text-ink-tertiary mb-4">
          Fill in the dimensions, finish, standards, tolerances, preferred
          vendor, and notes that the create form omits.
        </p>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm">
            <span className="text-ink-secondary">Spec name</span>
            <input
              type="text"
              value={specName}
              onChange={(e) => setSpecName(e.target.value)}
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
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
              <span className="text-ink-secondary">Color code</span>
              <input
                type="text"
                value={colorCode}
                onChange={(e) => setColorCode(e.target.value)}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Dimensions</span>
              <input
                type="text"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                placeholder="600×600×10 mm"
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Finish type</span>
              <input
                type="text"
                value={finishType}
                onChange={(e) => setFinishType(e.target.value)}
                placeholder="Honed matte"
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-ink-secondary">
              Applicable standards (one per line)
            </span>
            <textarea
              value={standards}
              onChange={(e) => setStandards(e.target.value)}
              rows={3}
              placeholder={"ISO 13006\nSNI 3976:2010"}
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            />
          </label>

          <label className="block text-sm">
            <span className="text-ink-secondary">Tolerance specifications</span>
            <textarea
              value={tolerances}
              onChange={(e) => setTolerances(e.target.value)}
              rows={2}
              placeholder="±0.5 mm flatness; ≤0.1% water absorption"
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="text-ink-secondary">Preferred vendor</span>
            <select
              value={preferredVendorId}
              onChange={(e) => setPreferredVendorId(e.target.value)}
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            >
              <option value="">— none —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-ink-secondary">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            />
          </label>

          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded border bg-surface border-ink/30 text-ink hover:bg-muted/50 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save details"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="text-xs px-3 py-1.5 rounded border bg-surface border-line-soft text-ink-secondary hover:bg-muted/40 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
