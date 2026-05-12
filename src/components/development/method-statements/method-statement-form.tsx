"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createMethodStatement } from "@/lib/development/server/method-statements/method-statement-actions";

const CATEGORIES = [
  "structural",
  "mep_electrical",
  "mep_plumbing",
  "mep_hvac",
  "finishing",
  "safety",
  "demolition",
  "site_preparation",
  "inspection",
  "handover",
  "general",
] as const;

interface StepDraft {
  id: string;
  instruction: string;
  duration: string;
}

let nextStepId = 1;

export function MethodStatementForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
} = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [methodCode, setMethodCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] =
    useState<typeof CATEGORIES[number]>("finishing");
  const [steps, setSteps] = useState<StepDraft[]>([
    { id: "s0", instruction: "", duration: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  function addStep() {
    setSteps((s) => [
      ...s,
      { id: `s${nextStepId++}`, instruction: "", duration: "" },
    ]);
  }
  function removeStep(id: string) {
    setSteps((s) => (s.length === 1 ? s : s.filter((x) => x.id !== id)));
  }
  function updateStep(id: string, key: "instruction" | "duration", value: string) {
    setSteps((s) =>
      s.map((x) => (x.id === id ? { ...x, [key]: value } : x)),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!methodCode.trim() || !title.trim()) {
      setError("Code and title are required");
      return;
    }
    const validSteps = steps.filter((s) => s.instruction.trim().length > 0);
    if (validSteps.length === 0) {
      setError("At least one step with an instruction is required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createMethodStatement({
          methodCode,
          title,
          category,
          procedureSteps: validSteps.map((s, i) => ({
            step: i + 1,
            instruction: s.instruction.trim(),
            duration: s.duration.trim() || undefined,
          })),
        });
        if (onSuccess) onSuccess();
        else router.push(`/development-os/method-statements/${encodeURIComponent(out.methodCode)}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Method code</span>
          <input
            type="text"
            value={methodCode}
            onChange={(e) => setMethodCode(e.target.value)}
            placeholder="MS-MICROCEMENT-WALL-001"
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
        <span className="text-ink-secondary">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Microcement application — interior walls"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-ink-secondary">Procedure steps</span>
          <button
            type="button"
            onClick={addStep}
            className="text-xs text-info hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add step
          </button>
        </div>
        <ul className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.id} className="flex gap-2 items-start">
              <span className="text-sm font-mono shrink-0 mt-2">{i + 1}.</span>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={s.instruction}
                  onChange={(e) => updateStep(s.id, "instruction", e.target.value)}
                  placeholder="Instruction"
                  className="col-span-2 rounded border border-line-soft p-2 text-sm"
                />
                <input
                  type="text"
                  value={s.duration}
                  onChange={(e) => updateStep(s.id, "duration", e.target.value)}
                  placeholder="Duration (optional)"
                  className="rounded border border-line-soft p-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => removeStep(s.id)}
                disabled={steps.length === 1}
                className="shrink-0 mt-2 text-ink-tertiary hover:text-danger disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Create method statement
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
