"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWorkPackage } from "@/lib/development/server/work-packages/work-package-actions";

export function WorkPackageForm({
  projectId,
  projectSlug,
  villas,
  parentOptions,
  budgetCategories,
}: {
  projectId: string;
  projectSlug: string;
  villas: Array<{ id: string; unitCode: string }>;
  parentOptions: Array<{ id: string; packageCode: string; name: string }>;
  budgetCategories: Array<{ id: string; displayName: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [packageCode, setPackageCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [selectedVillas, setSelectedVillas] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedFinish, setPlannedFinish] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggle(set: string[], value: string): string[] {
    return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!packageCode.trim() || !name.trim()) {
      setError("Code and name are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createWorkPackage({
          packageCode,
          name,
          projectId,
          parentId: parentId || null,
          villaIds: selectedVillas,
          plannedStart: plannedStart || null,
          plannedFinish: plannedFinish || null,
          budgetCategories: selectedCategories,
          budgetAmountMinor: budgetAmount
            ? BigInt(Math.round(Number(budgetAmount) * 100))
            : null,
        });
        router.push(
          `/development-os/projects/${projectSlug}/work-packages/${out.packageCode}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Package code</span>
          <input
            type="text"
            value={packageCode}
            onChange={(e) => setPackageCode(e.target.value)}
            placeholder="WP-ETV-001"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Foundation works"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            required
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Parent package (optional)</span>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        >
          <option value="">— Top-level —</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.packageCode} — {p.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="text-sm text-ink-secondary mb-2">Villas in scope</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {villas.map((v) => (
            <label
              key={v.id}
              className="flex items-center gap-2 text-sm border border-line-soft rounded px-2 py-1 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedVillas.includes(v.id)}
                onChange={() =>
                  setSelectedVillas(toggle(selectedVillas, v.id))
                }
              />
              <span className="font-mono text-xs">{v.unitCode}</span>
            </label>
          ))}
        </div>
      </div>

      {budgetCategories.length > 0 && (
        <div>
          <div className="text-sm text-ink-secondary mb-2">Budget categories</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {budgetCategories.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 text-sm border border-line-soft rounded px-2 py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(c.id)}
                  onChange={() =>
                    setSelectedCategories(toggle(selectedCategories, c.id))
                  }
                />
                <span>{c.displayName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Planned start</span>
          <input
            type="date"
            value={plannedStart}
            onChange={(e) => setPlannedStart(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Planned finish</span>
          <input
            type="date"
            value={plannedFinish}
            onChange={(e) => setPlannedFinish(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Budget (USD, optional)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
          />
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Create work package
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
