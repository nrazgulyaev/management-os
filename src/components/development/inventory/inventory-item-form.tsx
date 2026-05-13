"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createInventoryItem } from "@/lib/development/server/inventory/inventory-actions";

const CATEGORIES = [
  "cement",
  "rebar",
  "tile",
  "paint",
  "microcement",
  "electrical",
  "plumbing",
  "hvac",
  "wood_finishing",
  "glass_aluminium",
  "fixtures",
  "consumables",
  "other",
] as const;

const UOMS = ["bag", "kg", "m", "m2", "m3", "piece", "liter", "set"] as const;

export function InventoryItemForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
} = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("cement");
  const [uom, setUom] = useState<typeof UOMS[number]>("bag");
  const [reorderPoint, setReorderPoint] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sku.trim() || !name.trim()) {
      setError("SKU and name are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createInventoryItem({
          sku,
          displayName: name,
          description: description || null,
          category,
          unitOfMeasure: uom,
          reorderPoint: reorderPoint ? Number(reorderPoint) : null,
        });
        if (onSuccess) onSuccess();
        else router.push(`/development-os/inventory/items/${encodeURIComponent(out.sku)}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">SKU</span>
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="CEM-PORTLAND-50KG"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Display name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Portland cement, 50 kg bag"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Description (optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Unit of measure</span>
          <select
            value={uom}
            onChange={(e) => setUom(e.target.value as typeof uom)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Reorder point (optional)</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={reorderPoint}
          onChange={(e) => setReorderPoint(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
          placeholder="e.g., 50 (triggers low-stock alert)"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Create item
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
