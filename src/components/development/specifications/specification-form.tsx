"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSpecification } from "@/lib/development/server/specifications/specification-actions";

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

export function SpecificationForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [specCode, setSpecCode] = useState("");
  const [specName, setSpecName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] =
    useState<typeof CATEGORIES[number]>("wall_finish");
  const [brand, setBrand] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!specCode.trim() || !specName.trim() || !description.trim()) {
      setError("Code, name, and description are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createSpecification({
          specCode,
          specName,
          description,
          specCategory: category,
          brand: brand || null,
          modelNumber: modelNumber || null,
          colorCode: colorCode || null,
        });
        router.push(
          `/development-os/specifications/${encodeURIComponent(out.specCode)}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Spec code</span>
          <input
            type="text"
            value={specCode}
            onChange={(e) => setSpecCode(e.target.value)}
            placeholder="SPEC-MICROCEMENT-V3"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
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
          placeholder="Microcement Warm Taupe V3"
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
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Create specification
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
