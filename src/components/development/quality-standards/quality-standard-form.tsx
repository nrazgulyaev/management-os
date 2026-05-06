"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createQualityStandard } from "@/lib/development/server/quality-standards/quality-standard-actions";

export function QualityStandardForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [standardCode, setStandardCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [measurementMethod, setMeasurementMethod] = useState("");
  const [dimension, setDimension] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !standardCode.trim() ||
      !title.trim() ||
      !category.trim() ||
      !acceptanceCriteria.trim()
    ) {
      setError("Code, title, category, and acceptance criteria are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createQualityStandard({
          standardCode,
          title,
          category,
          acceptanceCriteria,
          measurementMethod: measurementMethod || null,
          toleranceSpecification:
            dimension && tolerance
              ? { dimension, tolerance, unit: unit || undefined }
              : null,
        });
        router.push(
          `/development-os/quality-standards/${encodeURIComponent(out.standardCode)}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Standard code</span>
          <input
            type="text"
            value={standardCode}
            onChange={(e) => setStandardCode(e.target.value)}
            placeholder="QS-WALL-FLATNESS-001"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Category</span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="wall_finish, tile_alignment, paint_coverage…"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            required
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Wall flatness — finished surfaces"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Acceptance criteria</span>
        <textarea
          value={acceptanceCriteria}
          onChange={(e) => setAcceptanceCriteria(e.target.value)}
          rows={4}
          placeholder="Maximum deviation of ±2mm when measured with a 2m straight-edge…"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Measurement method (optional)</span>
        <input
          type="text"
          value={measurementMethod}
          onChange={(e) => setMeasurementMethod(e.target.value)}
          placeholder="Visual inspection / 2m straight-edge / laser level"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>

      <fieldset className="border border-line-soft rounded p-3 space-y-2">
        <legend className="text-xs uppercase tracking-wide text-ink-tertiary px-1">
          Tolerance specification (optional)
        </legend>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-ink-secondary">Dimension</span>
            <input
              type="text"
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              placeholder="wall_flatness"
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Tolerance</span>
            <input
              type="text"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              placeholder="±2"
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-secondary">Unit</span>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="mm"
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            />
          </label>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Create quality standard
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
