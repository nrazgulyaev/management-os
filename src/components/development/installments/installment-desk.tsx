"use client";

/**
 * Operator buyers + installments desk — client interactions.
 *
 * Renders the plan table with row selection + a bulk "Send reminders" bar,
 * a per-plan auto-remind toggle, and a per-buyer drawer (Modal) showing the
 * full contract_milestones schedule with Mark-paid + Remind per line. All
 * writes go through the operator-side server actions, which permission-gate
 * and audit-log. Money is rendered from USD MINOR (cents) strings.
 *
 * Pixel target: cabinets/dev-p2/sales.html (buyers & installments). Dev OS
 * lineage — `.kpi` strip, `table.data`, `.badge`, the `.payment-ladder`
 * schedule rows, the amber `.toggle`, and the carbon pill toast. All values
 * are Layer-B tokens / Tailwind aliases; no raw hex, no inline geometry
 * except the dynamic progress-bar width.
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
  const [toast, setToast] = React.useState<string | null>(null);

  // Auto-dismiss toast (mock: 2.4s carbon pill).
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

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
    startBulk(async () => {
      const r = await bulkRemindPlans(ids);
      if (!r.ok) {
        setToast(r.error ?? "Could not send reminders.");
        return;
      }
      setSelected(new Set());
      setToast(
        `Reminders sent to ${r.plansReminded ?? 0} plan${(r.plansReminded ?? 0) === 1 ? "" : "s"}` +
          ((r.plansSkipped ?? 0) > 0 ? ` · ${r.plansSkipped} skipped (nothing due)` : ""),
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-tertiary">
          {selected.size > 0
            ? `${selected.size} plan${selected.size === 1 ? "" : "s"} selected`
            : `${plans.length} plan${plans.length === 1 ? "" : "s"}`}
        </p>
        <Button
          variant="accent"
          size="sm"
          disabled={selected.size === 0 || bulkPending}
          onClick={runBulk}
        >
          {bulkPending ? "Sending…" : `Send reminders${selected.size ? ` (${selected.size})` : ""}`}
        </Button>
      </div>

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
                <TD>
                  <div className="flex items-center gap-2">
                    <span className="text-display text-[15px] font-medium text-ink">
                      {p.buyerName}
                    </span>
                    {p.overdueCount > 0 && <Badge tone="danger">overdue</Badge>}
                  </div>
                </TD>
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
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="h-[7px] w-24 overflow-hidden rounded-full bg-inset">
                      <div
                        className="h-full rounded-full bg-success"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-ink-secondary">
                      {progress}%
                    </span>
                  </div>
                  <span className="mt-0.5 block text-[10px] text-ink-tertiary">
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
                    disabled={p.milestoneCount === 0}
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
          onToast={setToast}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-full bg-carbon px-[18px] py-[11px] text-[13px] text-white shadow-redesign-pop"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-remind toggle (inline) — mock `.sl-toggle` (amber when on)
// ---------------------------------------------------------------------------

function AutoRemindToggle({
  contractGroupId,
  enabled,
  disabled,
}: {
  contractGroupId: string;
  enabled: boolean;
  disabled?: boolean;
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
      disabled={pending || disabled}
      onClick={flip}
      className={`relative inline-flex h-[23px] w-10 items-center rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <span
        className={`inline-block h-[19px] w-[19px] transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[19px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Per-buyer drawer with the full schedule — mock `.sl-drawer`
// ---------------------------------------------------------------------------

function PlanDrawer({
  contractGroupId,
  onClose,
  onToast,
}: {
  contractGroupId: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<PlanDetailDTO | null>(null);
  const [loading, setLoading] = React.useState(true);

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

  // Price / paid / remaining from the milestone schedule (USD minor strings).
  const totals = React.useMemo(() => {
    if (!detail) return { price: 0n, paid: 0n, remaining: 0n };
    let price = 0n;
    let paid = 0n;
    for (const m of detail.milestones) {
      price += BigInt(m.expectedAmountUsdMinor);
      paid += BigInt(m.paidAmountUsdMinor);
    }
    return { price, paid, remaining: price - paid };
  }, [detail]);

  const paidPct = pct(totals.paid, totals.price);

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
        ) : (
          <div className="flex flex-col gap-4">
            {/* Price / Paid / Remaining — mock `.sl-kv` */}
            <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="font-mono text-[11px] uppercase tracking-wide text-ink-tertiary">Price</dt>
              <dd className="font-mono font-medium tabular-nums text-ink">{fmtUsdMinor2(totals.price)}</dd>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-ink-tertiary">Paid</dt>
              <dd className="font-mono font-medium tabular-nums text-success">
                {fmtUsdMinor2(totals.paid)} ({paidPct}%)
              </dd>
              <dt className="font-mono text-[11px] uppercase tracking-wide text-ink-tertiary">Remaining</dt>
              <dd className="font-mono font-medium tabular-nums text-ink">{fmtUsdMinor2(totals.remaining)}</dd>
            </dl>

            {/* Auto payment reminders — mock `.sl-switch` */}
            {detail.milestones.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3.5 py-3">
                <div>
                  <div className="text-[13.5px] font-medium text-ink">Auto payment reminders</div>
                  <div className="text-xs text-ink-tertiary">3 days before due + on overdue</div>
                </div>
                <AutoRemindToggle
                  contractGroupId={contractGroupId}
                  enabled={detail.autoRemindEnabled}
                />
              </div>
            )}

            {/* Schedule payments — mock `.payment-ladder` rows */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                Schedule payments (installment)
              </span>
            </div>
            {detail.milestones.length === 0 ? (
              <p className="text-[13px] text-ink-tertiary">
                Lead without a contract — no schedule yet.
              </p>
            ) : (
              <ol className="flex flex-col">
                {detail.milestones.map((m) => (
                  <MilestoneRow
                    key={m.id}
                    milestone={m}
                    onChanged={refreshAll}
                    onToast={onToast}
                    buyerName={detail.buyerName}
                  />
                ))}
              </ol>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {detail && (
          <RemindPlanButton
            contractGroupId={contractGroupId}
            onDone={refreshAll}
            onToast={onToast}
          />
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
  onToast,
  buyerName,
}: {
  milestone: PlanDetailDTO["milestones"][number];
  onChanged: () => void;
  onToast: (msg: string) => void;
  buyerName: string;
}) {
  const [pending, start] = React.useTransition();
  const remaining =
    BigInt(milestone.expectedAmountUsdMinor) - BigInt(milestone.paidAmountUsdMinor);
  const isOutstanding = OUTSTANDING.includes(milestone.status);
  const canPay = isOutstanding && remaining > 0n;

  function markPaid() {
    start(async () => {
      const fd = new FormData();
      fd.set("milestoneId", milestone.id);
      const r = await markMilestonePaidByOperator(fd);
      if (!r.ok) {
        onToast(r.error ?? "Could not mark paid.");
        return;
      }
      onToast("Payment marked paid");
      onChanged();
    });
  }

  function remind() {
    start(async () => {
      const fd = new FormData();
      fd.set("milestoneId", milestone.id);
      const r = await remindMilestone(fd);
      if (!r.ok) {
        onToast(r.error ?? "Could not send reminder.");
        return;
      }
      onToast(`Reminder sent · ${buyerName}`);
      onChanged();
    });
  }

  return (
    <li className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0">
      <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md bg-muted font-mono text-xs text-ink-tertiary">
        {milestone.sequence}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm text-ink">{milestone.name}</span>
          <span className="font-mono text-xs tabular-nums text-ink-tertiary">
            {fmtUsdMinor2(milestone.expectedAmountUsdMinor)}
          </span>
        </div>
        <div className="font-mono text-[11px] text-ink-tertiary">
          due {milestone.expectedDueDate ?? "—"}
          {BigInt(milestone.paidAmountUsdMinor) > 0n &&
            ` · paid ${fmtUsdMinor2(milestone.paidAmountUsdMinor)}`}
        </div>
      </div>
      <Badge tone={MS_TONE[milestone.status] ?? "neutral"}>
        {milestone.status.replace(/_/g, " ")}
      </Badge>
      {isOutstanding && (
        <div className="flex flex-none items-center gap-1.5">
          <Button variant="secondary" size="sm" disabled={pending} onClick={remind}>
            Remind
          </Button>
          <Button variant="accent" size="sm" disabled={!canPay || pending} onClick={markPaid}>
            {pending ? "…" : "Mark paid"}
          </Button>
        </div>
      )}
    </li>
  );
}

function RemindPlanButton({
  contractGroupId,
  onDone,
  onToast,
}: {
  contractGroupId: string;
  onDone: () => void;
  onToast: (msg: string) => void;
}) {
  const [pending, start] = React.useTransition();
  function run() {
    start(async () => {
      const fd = new FormData();
      fd.set("contractGroupId", contractGroupId);
      const r = await remindPlan(fd);
      if (!r.ok) {
        onToast(r.error ?? "Could not send reminders.");
        return;
      }
      onToast("Reminders sent to outstanding milestones");
      onDone();
    });
  }
  return (
    <Button variant="primary" size="sm" disabled={pending} onClick={run} className="mr-auto">
      {pending ? "Sending…" : "Remind all outstanding"}
    </Button>
  );
}
