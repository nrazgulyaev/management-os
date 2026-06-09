"use client";

/**
 * Operator buyers + installments desk — client interactions.
 *
 * Renders the plan table with row selection + a bulk "Send reminders" bar,
 * a per-plan auto-remind toggle, and a per-buyer drawer (Modal) showing the
 * full contract_milestones schedule with Mark-paid + Remind per line. All
 * writes go through the operator-side server actions, which permission-gate
 * and audit-log. Money is rendered from USD MINOR (cents) strings.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import {
  markMilestonePaidByOperator,
  remindMilestone,
  remindPlan,
  bulkRemindPlans,
  toggleAutoRemind,
  getPlanDetailAction,
  type PlanDetailDTO,
} from "@/lib/development/server/installment-desk-actions";
import type { InstallmentPlanSummary } from "@/lib/development/server/installments";

const STAGE_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral" | "accent" | "gold"> = {
  pending: "neutral",
  pre_invoiced: "info",
  invoiced: "accent",
  partially_paid: "gold",
  paid: "success",
  overdue: "danger",
  waived: "neutral",
  cancelled: "neutral",
  completed: "success",
};

const STAGE_LABEL: Record<string, string> = {
  pending: "Pending",
  pre_invoiced: "Pre-invoiced",
  invoiced: "Invoiced",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  waived: "Waived",
  cancelled: "Cancelled",
  completed: "Completed",
};

function fmtUsdMinor(minor: bigint | string): string {
  const cents = typeof minor === "bigint" ? minor : BigInt(minor);
  return (Number(cents) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtUsdMinor2(minor: bigint | string): string {
  const cents = typeof minor === "bigint" ? minor : BigInt(minor);
  return (Number(cents) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(paid: bigint | string, expected: bigint | string): number {
  const p = Number(typeof paid === "bigint" ? paid : BigInt(paid));
  const e = Number(typeof expected === "bigint" ? expected : BigInt(expected));
  if (e <= 0) return 0;
  return Math.min(100, Math.round((p / e) * 100));
}

interface PlanRow extends Omit<
  InstallmentPlanSummary,
  | "totalContractValueUsdMinor"
  | "expectedTotalUsdMinor"
  | "paidTotalUsdMinor"
  | "outstandingUsdMinor"
> {
  totalContractValueUsdMinor: string;
  expectedTotalUsdMinor: string;
  paidTotalUsdMinor: string;
  outstandingUsdMinor: string;
}

export function InstallmentDesk({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [openPlanId, setOpenPlanId] = React.useState<string | null>(null);
  const [bulkPending, startBulk] = React.useTransition();
  const [banner, setBanner] = React.useState<string | null>(null);

  const remindable = plans.filter((p) => p.outstandingUsdMinor !== "0" && Number(p.outstandingUsdMinor) > 0);
  const allSelected = remindable.length > 0 && remindable.every((p) => selected.has(p.contractGroupId));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(remindable.map((p) => p.contractGroupId)));
    }
  }

  function runBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBanner(null);
    startBulk(async () => {
      const r = await bulkRemindPlans(ids);
      if (!r.ok) {
        setBanner(r.error ?? "Could not send reminders.");
        return;
      }
      setSelected(new Set());
      setBanner(
        `Reminders sent to ${r.plansReminded ?? 0} plan${(r.plansReminded ?? 0) === 1 ? "" : "s"}` +
          ((r.plansSkipped ?? 0) > 0 ? ` · ${r.plansSkipped} skipped (nothing due)` : ""),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-tertiary">
          {selected.size > 0
            ? `${selected.size} plan${selected.size === 1 ? "" : "s"} selected`
            : `${plans.length} plan${plans.length === 1 ? "" : "s"}`}
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={selected.size === 0 || bulkPending}
          onClick={runBulk}
        >
          {bulkPending ? "Sending…" : `Send reminders${selected.size ? ` (${selected.size})` : ""}`}
        </Button>
      </div>

      {banner && (
        <div className="rounded-md border border-line-soft bg-muted/40 px-3 py-2 text-xs text-ink-secondary">
          {banner}
        </div>
      )}

      <Table>
        <THead>
          <TR>
            <TH className="w-8">
              <input
                type="checkbox"
                aria-label="Select all remindable plans"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-accent"
              />
            </TH>
            <TH>Buyer</TH>
            <TH>Unit</TH>
            <TH>Stage</TH>
            <TH>Paid progress</TH>
            <TH className="text-right">Outstanding</TH>
            <TH>Auto-remind</TH>
            <TH className="text-right">Schedule</TH>
          </TR>
        </THead>
        <TBody>
          {plans.map((p) => {
            const progress = pct(p.paidTotalUsdMinor, p.expectedTotalUsdMinor);
            const hasOutstanding = Number(p.outstandingUsdMinor) > 0;
            return (
              <TR key={p.contractGroupId}>
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.buyerName}`}
                    disabled={!hasOutstanding}
                    checked={selected.has(p.contractGroupId)}
                    onChange={() => toggleOne(p.contractGroupId)}
                    className="accent-accent disabled:opacity-30"
                  />
                </TD>
                <TD className="text-sm text-ink">{p.buyerName}</TD>
                <TD>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs text-ink-tertiary">{p.villaCode}</span>
                    <span className="text-xs text-ink-secondary">{p.projectName}</span>
                  </div>
                </TD>
                <TD>
                  <Badge tone={STAGE_TONE[p.stage] ?? "neutral"}>
                    {STAGE_LABEL[p.stage] ?? p.stage}
                  </Badge>
                  {p.overdueCount > 0 && (
                    <span className="ml-1.5 text-[10px] text-danger">{p.overdueCount} overdue</span>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-ink-secondary">
                      {progress}%
                    </span>
                  </div>
                  <span className="text-[10px] text-ink-tertiary">
                    {p.paidMilestoneCount}/{p.milestoneCount} milestones ·{" "}
                    {fmtUsdMinor(p.paidTotalUsdMinor)} of {fmtUsdMinor(p.expectedTotalUsdMinor)}
                  </span>
                </TD>
                <TD className="text-right font-mono tabular-nums text-sm text-ink">
                  {hasOutstanding ? fmtUsdMinor(p.outstandingUsdMinor) : "—"}
                </TD>
                <TD>
                  <AutoRemindToggle
                    contractGroupId={p.contractGroupId}
                    enabled={p.autoRemindEnabled}
                  />
                </TD>
                <TD className="text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setOpenPlanId(p.contractGroupId)}
                  >
                    Open
                  </Button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {openPlanId && (
        <PlanDrawer
          contractGroupId={openPlanId}
          onClose={() => setOpenPlanId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-remind toggle (inline)
// ---------------------------------------------------------------------------

function AutoRemindToggle({
  contractGroupId,
  enabled,
}: {
  contractGroupId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(enabled);
  const [pending, start] = React.useTransition();

  function flip() {
    const next = !on;
    setOn(next);
    start(async () => {
      const fd = new FormData();
      fd.set("contractGroupId", contractGroupId);
      fd.set("enabled", next ? "true" : "false");
      const r = await toggleAutoRemind(fd);
      if (!r.ok) {
        setOn(!next); // revert
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Toggle auto-remind"
      disabled={pending}
      onClick={flip}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-accent" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface shadow transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Per-buyer drawer with the full schedule
// ---------------------------------------------------------------------------

function PlanDrawer({
  contractGroupId,
  onClose,
}: {
  contractGroupId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<PlanDetailDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await getPlanDetailAction(contractGroupId);
      setDetail(d);
    } finally {
      setLoading(false);
    }
  }, [contractGroupId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function refreshAll() {
    void load();
    router.refresh();
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" ariaLabel="Installment schedule">
      <ModalHeader
        title={detail ? `${detail.buyerName} — ${detail.villaCode}` : "Installment schedule"}
        description={detail ? `${detail.projectName} · plan status: ${detail.groupStatus.replace(/_/g, " ")}` : undefined}
        onClose={onClose}
      />
      <ModalBody>
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">Loading schedule…</p>
        ) : !detail ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">Plan not found.</p>
        ) : detail.milestones.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">
            This plan has no milestones yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line-soft text-left">
                <tr>
                  <th className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-tertiary">#</th>
                  <th className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-tertiary">Milestone</th>
                  <th className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-tertiary">Due</th>
                  <th className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-tertiary text-right">Expected</th>
                  <th className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-tertiary text-right">Paid</th>
                  <th className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-tertiary">Status</th>
                  <th className="px-2 py-2 text-[11px] uppercase tracking-wide text-ink-tertiary text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.milestones.map((m) => (
                  <MilestoneRow key={m.id} milestone={m} onChanged={refreshAll} setErr={setErr} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      </ModalBody>
      <ModalFooter>
        {detail && (
          <RemindPlanButton contractGroupId={contractGroupId} onDone={refreshAll} setErr={setErr} />
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}

const OUTSTANDING: string[] = [
  "pending",
  "pre_invoiced",
  "invoiced",
  "partially_paid",
  "overdue",
];

const MS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral" | "accent" | "gold"> = {
  pending: "neutral",
  pre_invoiced: "info",
  invoiced: "accent",
  partially_paid: "gold",
  paid: "success",
  overdue: "danger",
  waived: "neutral",
  cancelled: "neutral",
};

function MilestoneRow({
  milestone,
  onChanged,
  setErr,
}: {
  milestone: PlanDetailDTO["milestones"][number];
  onChanged: () => void;
  setErr: (s: string | null) => void;
}) {
  const [pending, start] = React.useTransition();
  const remaining =
    BigInt(milestone.expectedAmountUsdMinor) - BigInt(milestone.paidAmountUsdMinor);
  const isOutstanding = OUTSTANDING.includes(milestone.status);
  const canPay = isOutstanding && remaining > 0n;

  function markPaid() {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("milestoneId", milestone.id);
      const r = await markMilestonePaidByOperator(fd);
      if (!r.ok) {
        setErr(r.error ?? "Could not mark paid.");
        return;
      }
      onChanged();
    });
  }

  function remind() {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("milestoneId", milestone.id);
      const r = await remindMilestone(fd);
      if (!r.ok) {
        setErr(r.error ?? "Could not send reminder.");
        return;
      }
      onChanged();
    });
  }

  return (
    <tr className="border-b border-line-soft last:border-b-0">
      <td className="px-2 py-2 font-mono text-xs text-ink-tertiary">{milestone.sequence}</td>
      <td className="px-2 py-2 text-ink">{milestone.name}</td>
      <td className="px-2 py-2 font-mono text-xs text-ink-secondary">
        {milestone.expectedDueDate ?? "—"}
      </td>
      <td className="px-2 py-2 text-right font-mono tabular-nums text-ink">
        {fmtUsdMinor2(milestone.expectedAmountUsdMinor)}
      </td>
      <td className="px-2 py-2 text-right font-mono tabular-nums text-ink-secondary">
        {fmtUsdMinor2(milestone.paidAmountUsdMinor)}
      </td>
      <td className="px-2 py-2">
        <Badge tone={MS_TONE[milestone.status] ?? "neutral"}>
          {milestone.status.replace(/_/g, " ")}
        </Badge>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" disabled={!canPay || pending} onClick={markPaid}>
            {pending ? "…" : "Mark paid"}
          </Button>
          <Button variant="secondary" size="sm" disabled={!isOutstanding || pending} onClick={remind}>
            Remind
          </Button>
        </div>
      </td>
    </tr>
  );
}

function RemindPlanButton({
  contractGroupId,
  onDone,
  setErr,
}: {
  contractGroupId: string;
  onDone: () => void;
  setErr: (s: string | null) => void;
}) {
  const [pending, start] = React.useTransition();
  function run() {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("contractGroupId", contractGroupId);
      const r = await remindPlan(fd);
      if (!r.ok) {
        setErr(r.error ?? "Could not send reminders.");
        return;
      }
      onDone();
    });
  }
  return (
    <Button variant="primary" size="sm" disabled={pending} onClick={run} className="mr-auto">
      {pending ? "Sending…" : "Remind all outstanding"}
    </Button>
  );
}
