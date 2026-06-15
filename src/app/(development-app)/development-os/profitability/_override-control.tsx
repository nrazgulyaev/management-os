"use client";

/**
 * Wire-up — per-allocation manual override. overrideUnitAllocation existed
 * (server-only) with no UI caller. A drawer collects the bucket overrides
 * (major units) plus the REQUIRED audit notes, and posts to the co-located
 * "use server" _override-action.ts adapter.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { overrideUnitAllocationAction } from "./_override-action";

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

const BUCKETS: { key: string; label: string }[] = [
  { key: "landCostAllocatedMinor", label: "Land cost" },
  { key: "hardCostDirectMinor", label: "Hard cost (direct)" },
  { key: "hardCostAllocatedMinor", label: "Hard cost (allocated)" },
  { key: "softCostAllocatedMinor", label: "Soft cost" },
  { key: "marketingCostAllocatedMinor", label: "Marketing cost" },
  { key: "financingCostAllocatedMinor", label: "Financing cost" },
  { key: "contingencyUsedMinor", label: "Contingency used" },
  { key: "expectedSalePriceMinor", label: "Expected sale price" },
];

export function AllocationOverrideButton({
  allocationId,
  unitCode,
}: {
  allocationId: string;
  unitCode: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const overridesMajor: Record<string, string> = {};
    for (const b of BUCKETS) {
      const v = (fd.get(b.key) ?? "").toString().trim();
      if (v !== "") overridesMajor[b.key] = v;
    }
    const notes = (fd.get("notes") ?? "").toString().trim();
    start(async () => {
      const r = await overrideUnitAllocationAction({
        allocationId,
        notes,
        overridesMajor,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(null); setOpen(true); }}
        className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
      >
        Override
      </button>
      {open && (
        <div className="modal-overlay flex items-center justify-end" onClick={() => setOpen(false)}>
          <div
            className="h-full w-full max-w-md border-l border-line-soft bg-surface p-5 shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-1">Override allocation</h2>
            <p className="text-xs text-ink-tertiary mb-3">
              {unitCode ?? "unit"} · enter only the buckets you want to override
              (major units). Leave the rest blank to keep the computed value.
              This flips the allocation to <span className="font-mono">manual_override</span>.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {BUCKETS.map((b) => (
                  <label key={b.key} className="flex flex-col gap-1 text-xs text-ink-secondary">
                    {b.label}
                    <input
                      type="number"
                      name={b.key}
                      min={0}
                      step="any"
                      className={inputCls}
                      placeholder="—"
                    />
                  </label>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                Reason (required)
                <textarea
                  name="notes"
                  rows={3}
                  required
                  minLength={1}
                  className={inputCls}
                  placeholder="Why is this allocation being overridden?"
                />
              </label>
              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Apply override"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
