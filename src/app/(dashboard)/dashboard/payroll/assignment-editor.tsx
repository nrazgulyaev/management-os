"use client";

import { useState } from "react";
import { selectCls, inputCls } from "@/components/admin/form-shell";

export interface TargetOption {
  id: string;
  label: string;
}

export interface AssignmentDraft {
  /** Exactly one of villaId / projectId is set. */
  villaId: string | null;
  projectId: string | null;
  weight: number;
}

interface Row extends AssignmentDraft {
  /** "villa" | "project" — drives which picker shows. */
  kind: "villa" | "project";
}

/**
 * Multi-target assignment editor. Lets you attach a staff member to N villas
 * and/or projects, each with a per_villa fan-out weight. Serialises its rows
 * into a single hidden input named `assignments` (JSON) that the server action
 * parses with `assignmentInputSchema`.
 *
 * For per_villa_fixed staff the monthly cost = per_villa_rate × Σ(weights) and
 * one expense line is posted PER row. For salaried staff the first row is the
 * single target (fallback allocation scope applies when there are no rows).
 */
export function AssignmentEditor({
  villas,
  projects,
  initial,
  weightRelevant,
}: {
  villas: TargetOption[];
  projects: TargetOption[];
  initial: AssignmentDraft[];
  /** When true (per_villa_fixed) the weight column matters; otherwise hint it. */
  weightRelevant: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.map((a) => ({
      ...a,
      kind: a.projectId ? "project" : "villa",
    })),
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow(kind: "villa" | "project") {
    setRows((prev) => [...prev, { kind, villaId: null, projectId: null, weight: 1 }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Only emit rows that picked a target.
  const payload: AssignmentDraft[] = rows
    .filter((r) => (r.kind === "villa" ? r.villaId : r.projectId))
    .map((r) => ({
      villaId: r.kind === "villa" ? r.villaId : null,
      projectId: r.kind === "project" ? r.projectId : null,
      weight: r.weight > 0 ? r.weight : 1,
    }));

  return (
    <div className="flex flex-col gap-2.5">
      <input type="hidden" name="assignments" value={JSON.stringify(payload)} />
      {rows.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic m-0">
          No assignments. Salaried staff fall back to the allocation scope below; per-villa-fixed
          staff need at least one assignment to post anything.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                aria-label="Target type"
                value={r.kind}
                onChange={(e) =>
                  update(i, {
                    kind: e.target.value as "villa" | "project",
                    villaId: null,
                    projectId: null,
                  })
                }
                className={`${selectCls} max-w-[120px]`}
              >
                <option value="villa">Villa</option>
                <option value="project">Project</option>
              </select>
              {r.kind === "villa" ? (
                <select
                  aria-label="Villa"
                  value={r.villaId ?? ""}
                  onChange={(e) => update(i, { villaId: e.target.value || null })}
                  className={selectCls}
                >
                  <option value="">— Choose a villa —</option>
                  {villas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  aria-label="Project"
                  value={r.projectId ?? ""}
                  onChange={(e) => update(i, { projectId: e.target.value || null })}
                  className={selectCls}
                >
                  <option value="">— Choose a project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
              <input
                aria-label="Weight"
                type="number"
                min="0.001"
                step="0.001"
                value={r.weight}
                onChange={(e) => update(i, { weight: Number(e.target.value) })}
                className={`${inputCls} max-w-[90px]`}
                title={weightRelevant ? "Per-villa fan-out multiplier" : "Weight (per-villa-fixed only)"}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="btn btn-ghost btn-sm"
                aria-label="Remove assignment"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => addRow("villa")} className="btn btn-ghost btn-sm">
          + Villa
        </button>
        <button type="button" onClick={() => addRow("project")} className="btn btn-ghost btn-sm">
          + Project
        </button>
        {weightRelevant ? (
          <span className="text-[11px] text-ink-4">
            cost = per-villa rate × sum of weights ({payload.reduce((a, r) => a + r.weight, 0)})
          </span>
        ) : null}
      </div>
    </div>
  );
}
