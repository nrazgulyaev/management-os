"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
    <form onSubmit={submit} className="card p-6 flex flex-col gap-4 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <span className="field-label">BOQ code</span>
          <input
            type="text"
            value={boqCode}
            onChange={(e) => setBoqCode(e.target.value)}
            placeholder="BOQ-ETV-2026-001"
            className="input mono"
            required
          />
        </div>
        <div className="field">
          <span className="field-label">Version label</span>
          <input
            type="text"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            placeholder="v1.0"
            className="input"
            required
          />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Eternal Villas — main works"
          className="input"
          required
        />
      </div>
      <div className="field">
        <span className="field-label">Project</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="select"
          required
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="field">
          <span className="field-label">Currency</span>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="input mono"
            required
          />
        </div>
        <div className="field">
          <span className="field-label">QS firm (optional)</span>
          <input
            type="text"
            value={qsFirm}
            onChange={(e) => setQsFirm(e.target.value)}
            className="input"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
          Create BOQ
        </button>
        {error && <p className="field-error">{error}</p>}
      </div>
    </form>
  );
}
