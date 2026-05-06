"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBoqDocument } from "@/lib/development/server/boq/boq-actions";

export function BoqForm({
  projects,
}: {
  projects: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [boqCode, setBoqCode] = useState("");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [versionLabel, setVersionLabel] = useState("v1.0");
  const [currency, setCurrency] = useState("IDR");
  const [qsFirm, setQsFirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!boqCode.trim() || !title.trim()) {
      setError("Code and title are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createBoqDocument({
          boqCode,
          title,
          projectId,
          versionLabel,
          currency,
          qsFirm: qsFirm || null,
        });
        router.push(`/development-os/boq/${encodeURIComponent(out.boqCode)}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">BOQ code</span>
          <input
            type="text"
            value={boqCode}
            onChange={(e) => setBoqCode(e.target.value)}
            placeholder="BOQ-ETV-2026-001"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Version label</span>
          <input
            type="text"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            placeholder="v1.0"
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
          placeholder="Eternal Villas — main works"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Project</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Currency</span>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">QS firm (optional)</span>
          <input
            type="text"
            value={qsFirm}
            onChange={(e) => setQsFirm(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Create BOQ
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
