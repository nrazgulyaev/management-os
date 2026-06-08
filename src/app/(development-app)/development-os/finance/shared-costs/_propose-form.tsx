"use client";

/**
 * Wire-up sweep — propose shared-cost allocation. proposeSharedCostAllocation
 * ("use server") existed with no UI. Repeatable project lines must sum to
 * exactly 100% (helper + DB trigger enforce it; we validate client-side).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { proposeSharedCostAllocation } from "@/lib/development/server/shared-costs/shared-cost-actions";

const METHODS = [
  "manual_split",
  "by_floor_area",
  "by_land_area",
  "by_unit_count",
  "by_budget_size",
  "by_revenue_share",
  "by_time_spent",
  "by_headcount",
  "fixed_percentage",
  "custom_formula",
] as const;
type Method = (typeof METHODS)[number];

interface Line {
  projectId: string;
  percentage: string;
}

const inputCls = "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

export function ProposeSharedCostForm({
  projects,
  sources,
}: {
  projects: { id: string; name: string }[];
  sources: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [sourceId, setSourceId] = React.useState("");
  const [method, setMethod] = React.useState<Method>("manual_split");
  const [lines, setLines] = React.useState<Line[]>([
    { projectId: "", percentage: "" },
    { projectId: "", percentage: "" },
  ]);
  const [notes, setNotes] = React.useState("");
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  const total = lines.reduce((s, l) => s + (Number(l.percentage) || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.001;
  const linesValid =
    lines.filter((l) => l.projectId && Number(l.percentage) > 0).length >= 2;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (!sourceId) return setErr("Pick a source transaction.");
    if (!linesValid) return setErr("Need ≥2 project lines with a percentage.");
    if (!totalOk) return setErr(`Percentages must sum to 100% (now ${total.toFixed(2)}%).`);
    const payloadLines = lines
      .filter((l) => l.projectId && Number(l.percentage) > 0)
      .map((l) => ({ projectId: l.projectId, percentage: Number(l.percentage) }));
    start(async () => {
      try {
        await proposeSharedCostAllocation({
          sourceTransactionId: sourceId,
          allocationMethod: method,
          lines: payloadLines,
          notes: notes.trim() || undefined,
        });
        setOpen(false);
        router.refresh();
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : "Failed to propose allocation.");
      }
    });
  }

  return (
    <>
      <Button type="button" onClick={() => { setErr(null); setOpen(true); }}>
        Propose allocation
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold mb-3">Propose shared-cost allocation</h2>
            <form onSubmit={submit} className="space-y-3">
              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                Source transaction *
                <select required className={inputCls} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  <option value="" disabled>Select transaction…</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                Allocation method
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                  {METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
                </select>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-secondary">Project lines (≥2, sum 100%)</span>
                  <span className={`text-xs font-mono ${totalOk ? "text-emerald-600" : "text-amber-600"}`}>
                    {total.toFixed(2)}%
                  </span>
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className={`${inputCls} flex-1`}
                      value={l.projectId}
                      onChange={(e) => setLine(i, { projectId: e.target.value })}
                    >
                      <option value="">Select project…</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={l.percentage}
                      onChange={(e) => setLine(i, { percentage: e.target.value })}
                      className="w-24 rounded border border-line-soft bg-surface px-2 py-1 text-sm"
                      placeholder="%"
                    />
                    {lines.length > 2 && (
                      <button type="button" className="text-xs text-danger px-1" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
                  onClick={() => setLines((ls) => [...ls, { projectId: "", percentage: "" }])}
                >
                  + Add line
                </button>
              </div>

              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                Notes
                <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
              </label>

              {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={pending || !totalOk || !linesValid || !sourceId}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50">{pending ? "Proposing…" : "Propose draft"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
