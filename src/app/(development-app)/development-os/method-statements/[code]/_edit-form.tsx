"use client";

/**
 * Method-statement edit form. The create form (`method-statements/new`)
 * only collects code / title / description / category / procedure steps.
 * This island lets an operator fill in the operational detail the detail
 * page already renders — required tools, materials, PPE, quality
 * checkpoints, safety hazards + mitigations (plus title / description /
 * notes) — that previously had no way to be set after creation.
 *
 * `updateMethodStatement` is org-scoped + permission-gated server-side
 * and lives in a "use server" module, so this client island imports it
 * directly. Pattern mirrors the spec edit form.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateMethodStatement } from "@/lib/development/server/method-statements/method-statement-actions";

interface QualityCheckpoint {
  checkpoint: string;
  tolerance?: string;
}

/** Serialise checkpoints to a "checkpoint | tolerance" line format. */
function checkpointsToText(items: QualityCheckpoint[]): string {
  return items
    .map((c) => (c.tolerance ? `${c.checkpoint} | ${c.tolerance}` : c.checkpoint))
    .join("\n");
}

function parseCheckpoints(text: string): QualityCheckpoint[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [checkpoint, tolerance] = line.split("|").map((s) => s.trim());
      return tolerance
        ? { checkpoint, tolerance }
        : { checkpoint };
    })
    .filter((c) => c.checkpoint.length > 0);
}

function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function MethodStatementEditForm({
  methodId,
  defaults,
}: {
  methodId: string;
  defaults: {
    title: string;
    description: string | null;
    requiredTools: string[] | null;
    requiredMaterials: string[] | null;
    requiredPpe: string[] | null;
    qualityCheckpoints: QualityCheckpoint[] | null;
    safetyHazards: string[] | null;
    hazardMitigations: string[] | null;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState(defaults.title);
  const [description, setDescription] = useState(defaults.description ?? "");
  const [tools, setTools] = useState((defaults.requiredTools ?? []).join("\n"));
  const [materials, setMaterials] = useState(
    (defaults.requiredMaterials ?? []).join("\n"),
  );
  const [ppe, setPpe] = useState((defaults.requiredPpe ?? []).join("\n"));
  const [checkpoints, setCheckpoints] = useState(
    checkpointsToText(defaults.qualityCheckpoints ?? []),
  );
  const [hazards, setHazards] = useState(
    (defaults.safetyHazards ?? []).join("\n"),
  );
  const [mitigations, setMitigations] = useState(
    (defaults.hazardMitigations ?? []).join("\n"),
  );
  const [notes, setNotes] = useState(defaults.notes ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    start(async () => {
      try {
        await updateMethodStatement({
          methodId,
          title: title.trim(),
          description: description.trim() || null,
          requiredTools: linesToArray(tools),
          requiredMaterials: linesToArray(materials),
          requiredPpe: linesToArray(ppe),
          qualityCheckpoints: parseCheckpoints(checkpoints),
          safetyHazards: linesToArray(hazards),
          hazardMitigations: linesToArray(mitigations),
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
        className="btn btn-secondary btn-sm"
      >
        <Pencil className="w-4 h-4" strokeWidth={1.75} />
        Edit details
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-line-soft bg-surface p-5 shadow-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-medium mb-1">Edit method statement details</h3>
        <p className="text-xs text-ink-tertiary mb-4">
          Required tools / materials / PPE, quality checkpoints, and safety
          hazards / mitigations. One item per line. For checkpoints use
          <code className="mx-1 font-mono">checkpoint | tolerance</code>.
        </p>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm">
            <span className="text-ink-secondary">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Required tools</span>
              <textarea
                value={tools}
                onChange={(e) => setTools(e.target.value)}
                rows={4}
                placeholder={"Laser level\nNotched trowel"}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Required materials</span>
              <textarea
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                rows={4}
                placeholder={"Tile adhesive C2TE\nSpacers 2mm"}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Required PPE</span>
              <textarea
                value={ppe}
                onChange={(e) => setPpe(e.target.value)}
                rows={4}
                placeholder={"Safety glasses\nKnee pads"}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-ink-secondary">
              Quality checkpoints (checkpoint | tolerance, one per line)
            </span>
            <textarea
              value={checkpoints}
              onChange={(e) => setCheckpoints(e.target.value)}
              rows={3}
              placeholder={"Surface flatness | ±2mm over 2m\nGrout line width | 2mm ±0.5mm"}
              className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Safety hazards</span>
              <textarea
                value={hazards}
                onChange={(e) => setHazards(e.target.value)}
                rows={4}
                placeholder={"Dust inhalation\nElectrical tools near water"}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-secondary">Hazard mitigations</span>
              <textarea
                value={mitigations}
                onChange={(e) => setMitigations(e.target.value)}
                rows={4}
                placeholder={"Wear FFP2 mask\nUse RCD-protected outlets"}
                className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
              />
            </label>
          </div>

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
