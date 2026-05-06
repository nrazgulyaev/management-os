"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDrawing } from "@/lib/development/server/drawings/drawing-actions";

const DRAWING_TYPES = [
  "architectural",
  "structural",
  "mep_electrical",
  "mep_plumbing",
  "mep_hvac",
  "landscape",
  "pool",
  "site_plan",
  "detail",
  "shop_drawing",
  "as_built",
  "sketch",
  "other",
] as const;

const DRAWING_PHASES = [
  "concept",
  "schematic_design",
  "design_development",
  "permit_set",
  "construction_set",
  "as_built",
] as const;

export function DrawingForm({
  projects,
}: {
  projects: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawingCode, setDrawingCode] = useState("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [drawingType, setDrawingType] =
    useState<typeof DRAWING_TYPES[number]>("architectural");
  const [drawingPhase, setDrawingPhase] = useState<
    typeof DRAWING_PHASES[number] | ""
  >("");
  const [authorFirm, setAuthorFirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!drawingCode.trim() || !drawingNumber.trim() || !title.trim()) {
      setError("Code, number, and title are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createDrawing({
          drawingCode,
          drawingNumber,
          title,
          projectId,
          drawingType,
          drawingPhase: drawingPhase || null,
          authorFirm: authorFirm || null,
        });
        router.push(
          `/development-os/drawings/${encodeURIComponent(out.drawingCode)}`,
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
          <span className="text-ink-secondary">Drawing code</span>
          <input
            type="text"
            value={drawingCode}
            onChange={(e) => setDrawingCode(e.target.value)}
            placeholder="ARC-ETV-A-001"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Drawing number</span>
          <input
            type="text"
            value={drawingNumber}
            onChange={(e) => setDrawingNumber(e.target.value)}
            placeholder="A-001"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
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
          placeholder="Ground floor plan — Villa A"
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
          <span className="text-ink-secondary">Type</span>
          <select
            value={drawingType}
            onChange={(e) =>
              setDrawingType(e.target.value as typeof drawingType)
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {DRAWING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Phase</span>
          <select
            value={drawingPhase}
            onChange={(e) =>
              setDrawingPhase(e.target.value as typeof drawingPhase)
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            <option value="">—</option>
            {DRAWING_PHASES.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Author firm (optional)</span>
        <input
          type="text"
          value={authorFirm}
          onChange={(e) => setAuthorFirm(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Create drawing
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
