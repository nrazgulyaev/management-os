"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createQaQcIssue } from "@/lib/development/server/qa-qc/qa-qc-actions";

/**
 * Mobile-friendly QA/QC issue create form. Used by site supervisors on
 * phones — every interactive control is at least 44px tall, single-column
 * layout below the md breakpoint, severity buttons are touch-large.
 */
export function QaQcCreateForm({
  projects,
  villas,
  categories,
  defaultProjectId,
  defaultVillaId,
  onSuccess,
  onCancel,
}: {
  projects: Array<{ id: string; name: string }>;
  villas: Array<{ id: string; unitCode: string; projectId: string }>;
  categories: Array<{ id: string; displayName: string }>;
  defaultProjectId?: string;
  defaultVillaId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [villaId, setVillaId] = useState(defaultVillaId ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredVillas = villas.filter((v) => v.projectId === projectId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createQaQcIssue({
          title,
          projectId,
          villaId: villaId || null,
          zoneReference: zone || null,
          categoryId,
          severity,
          description,
          deadlineAt: deadline || null,
        });
        if (onSuccess) onSuccess();
        else router.push(`/development-os/qa-qc/${out.issueCode}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  const SEVERITY_BUTTONS: Array<{
    value: typeof severity;
    label: string;
    tone: string;
  }> = [
    { value: "low", label: "Low", tone: "bg-stone-200 text-stone-700" },
    { value: "medium", label: "Medium", tone: "bg-blue-200 text-blue-900" },
    { value: "high", label: "High", tone: "bg-amber-200 text-amber-900" },
    {
      value: "critical",
      label: "Critical",
      tone: "bg-red-200 text-red-900",
    },
  ];

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Crack in master bath wall"
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          required
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Project</span>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setVillaId("");
            }}
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
            required
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-ink-secondary">Villa (optional)</span>
          <select
            value={villaId}
            onChange={(e) => setVillaId(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          >
            <option value="">— Project-level —</option>
            {filteredVillas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.unitCode}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Zone reference (optional)</span>
        <input
          type="text"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="Ground floor / Bedroom 2 / North wall"
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
        />
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Category</span>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          required
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="text-sm text-ink-secondary mb-2">Severity</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SEVERITY_BUTTONS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setSeverity(b.value)}
              className={`min-h-[44px] rounded text-sm font-medium ${b.tone} ${
                severity === b.value
                  ? "ring-2 ring-offset-2 ring-stone-900"
                  : ""
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="What's wrong? Where exactly? Photos help."
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Deadline (optional)</span>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
        />
      </label>

      {error && (
        <p className="text-xs text-danger flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-[44px] w-full md:w-auto">
          {pending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Log issue
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>

      <p className="text-[11px] text-ink-tertiary">
        Photos can be attached on the detail page after creation.
      </p>
    </form>
  );
}
