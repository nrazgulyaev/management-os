"use client";

/**
 * Wire-up — project-cycle input forms. createPayrollPeriod +
 * trackTeamCapacity existed (server-only) with no UI caller. These modal
 * islands post to the co-located "use server" _actions.ts adapters, which
 * convert major→minor money and forward to the org-scoped server actions.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createPayrollPeriodAction,
  trackTeamCapacityAction,
} from "./_actions";

type Project = { id: string; name: string };

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

const ROLE_TYPES = [
  "pm",
  "qs",
  "site_supervisor",
  "engineer",
  "architect",
  "designer",
  "admin",
  "sales",
  "finance",
  "other",
] as const;

export function ProjectCycleInputForms({ projects }: { projects: Project[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NewPayrollPeriodButton projects={projects} />
      <RecordCapacityButton projects={projects} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// New payroll period
// ---------------------------------------------------------------------------

function NewPayrollPeriodButton({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [allocRows, setAllocRows] = React.useState<number>(1);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    const num = (k: string) => Number(fd.get(k) ?? 0);

    const allocations: {
      projectId: string;
      allocationPercentage: number;
      amountMajor: string;
    }[] = [];
    for (let i = 0; i < allocRows; i++) {
      const projectId = str(`alloc_project_${i}`);
      if (!projectId) continue;
      allocations.push({
        projectId,
        allocationPercentage: Number(fd.get(`alloc_pct_${i}`) ?? 0),
        amountMajor: (fd.get(`alloc_amount_${i}`) ?? "0").toString(),
      });
    }

    start(async () => {
      const r = await createPayrollPeriodAction({
        periodLabel: str("periodLabel"),
        periodType: str("periodType") as
          | "weekly"
          | "biweekly"
          | "monthly"
          | "quarterly",
        periodStart: str("periodStart"),
        periodEnd: str("periodEnd"),
        totalPayrollAmountMajor: str("totalPayrollAmountMajor"),
        currency: str("currency") || "IDR",
        totalHeadcount: num("totalHeadcount"),
        allocations,
        notes: str("notes") || null,
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
      <Button type="button" onClick={() => { setErr(null); setAllocRows(1); setOpen(true); }}>
        New payroll period
      </Button>
      {open && (
        <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">New payroll period</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Label" span2>
                  <input name="periodLabel" required minLength={1} className={inputCls} placeholder="June 2026 payroll" />
                </L>
                <L label="Type">
                  <select name="periodType" className={inputCls} defaultValue="monthly">
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </L>
                <L label="Currency">
                  <input name="currency" className={inputCls} defaultValue="IDR" />
                </L>
                <L label="Period start">
                  <input type="date" name="periodStart" required className={inputCls} />
                </L>
                <L label="Period end">
                  <input type="date" name="periodEnd" required className={inputCls} />
                </L>
                <L label="Total payroll (major units)">
                  <input type="number" name="totalPayrollAmountMajor" min={0} step="any" required className={inputCls} placeholder="125000000" />
                </L>
                <L label="Headcount">
                  <input type="number" name="totalHeadcount" min={1} step={1} required className={inputCls} />
                </L>
              </div>

              <div className="border-t border-line-soft pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-ink-secondary">Per-project allocations (optional)</span>
                  <button
                    type="button"
                    onClick={() => setAllocRows((n) => n + 1)}
                    className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
                  >
                    + Row
                  </button>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: allocRows }).map((_, i) => (
                    <div key={i} className="grid grid-cols-[1.6fr_0.7fr_1.1fr] gap-2">
                      <select name={`alloc_project_${i}`} className={inputCls} defaultValue="">
                        <option value="">— project —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input type="number" name={`alloc_pct_${i}`} min={0} max={100} step="any" className={inputCls} placeholder="%" />
                      <input type="number" name={`alloc_amount_${i}`} min={0} step="any" className={inputCls} placeholder="amount" />
                    </div>
                  ))}
                </div>
              </div>

              <L label="Notes" span2>
                <input name="notes" className={inputCls} />
              </L>

              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50">
                  {pending ? "Saving…" : "Create period"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Record team capacity
// ---------------------------------------------------------------------------

function RecordCapacityButton({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [allocRows, setAllocRows] = React.useState<number>(1);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => (fd.get(k) ?? "").toString().trim();
    const num = (k: string) => Number(fd.get(k) ?? 0);

    const allocations: { projectId: string; hours: number; percentage: number }[] = [];
    for (let i = 0; i < allocRows; i++) {
      const projectId = str(`cap_project_${i}`);
      if (!projectId) continue;
      allocations.push({
        projectId,
        hours: Number(fd.get(`cap_hours_${i}`) ?? 0),
        percentage: Number(fd.get(`cap_pct_${i}`) ?? 0),
      });
    }

    start(async () => {
      const r = await trackTeamCapacityAction({
        trackingPeriodStart: str("trackingPeriodStart"),
        trackingPeriodEnd: str("trackingPeriodEnd"),
        roleType: str("roleType") as TrackRole,
        totalTeamMembers: num("totalTeamMembers"),
        totalCapacityHours: num("totalCapacityHours"),
        utilizedHours: num("utilizedHours"),
        allocations,
        notes: str("notes") || null,
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
      <Button type="button" variant="secondary" onClick={() => { setErr(null); setAllocRows(1); setOpen(true); }}>
        Record capacity
      </Button>
      {open && (
        <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">Record team capacity</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Role">
                  <select name="roleType" className={inputCls} defaultValue="pm">
                    {ROLE_TYPES.map((r) => (
                      <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </L>
                <L label="Team members">
                  <input type="number" name="totalTeamMembers" min={0} step={1} required className={inputCls} />
                </L>
                <L label="Period start">
                  <input type="date" name="trackingPeriodStart" required className={inputCls} />
                </L>
                <L label="Period end">
                  <input type="date" name="trackingPeriodEnd" required className={inputCls} />
                </L>
                <L label="Total capacity hours">
                  <input type="number" name="totalCapacityHours" min={0} step="any" required className={inputCls} />
                </L>
                <L label="Utilized hours">
                  <input type="number" name="utilizedHours" min={0} step="any" required className={inputCls} />
                </L>
              </div>

              <div className="border-t border-line-soft pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-ink-secondary">Per-project allocations</span>
                  <button
                    type="button"
                    onClick={() => setAllocRows((n) => n + 1)}
                    className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
                  >
                    + Row
                  </button>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: allocRows }).map((_, i) => (
                    <div key={i} className="grid grid-cols-[1.6fr_0.9fr_0.7fr] gap-2">
                      <select name={`cap_project_${i}`} className={inputCls} defaultValue="">
                        <option value="">— project —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input type="number" name={`cap_hours_${i}`} min={0} step="any" className={inputCls} placeholder="hours" />
                      <input type="number" name={`cap_pct_${i}`} min={0} max={100} step="any" className={inputCls} placeholder="%" />
                    </div>
                  ))}
                </div>
              </div>

              <L label="Notes" span2>
                <input name="notes" className={inputCls} />
              </L>

              {err && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending}
                  className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={pending}
                  className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50">
                  {pending ? "Saving…" : "Record capacity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

type TrackRole =
  | "pm"
  | "qs"
  | "site_supervisor"
  | "engineer"
  | "architect"
  | "designer"
  | "admin"
  | "sales"
  | "finance"
  | "other";

function L({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
