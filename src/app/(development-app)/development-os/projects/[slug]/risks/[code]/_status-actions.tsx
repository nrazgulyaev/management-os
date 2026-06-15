"use client";

/**
 * Wire-up (dev-OS engineering-doc lifecycles §2) — project-risk mitigation
 * status transitions. `transitionRiskStatus` existed server-side but had
 * ZERO UI triggers, so a risk's mitigation status could never advance or
 * close. This renders the legal next states for the current status; closing
 * states collect an optional reason. The server is the authority.
 *
 * Mitigation ladder (mirrors MITIGATION_STATUSES in risk-actions.ts):
 *   identified → planning_mitigation → mitigating → monitored
 * with closure to closed_resolved or closed_realized from any active state.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transitionRiskStatus } from "@/lib/development/server/risks/risk-actions";

type MitigationStatus =
  | "identified"
  | "planning_mitigation"
  | "mitigating"
  | "monitored"
  | "closed_resolved"
  | "closed_realized";

const ADVANCE: Record<string, MitigationStatus | null> = {
  identified: "planning_mitigation",
  planning_mitigation: "mitigating",
  mitigating: "monitored",
  monitored: null,
  closed_resolved: null,
  closed_realized: null,
};

const ADVANCE_LABEL: Record<string, string> = {
  identified: "Plan mitigation",
  planning_mitigation: "Start mitigating",
  mitigating: "Move to monitored",
};

function isTerminal(status: string): boolean {
  return status === "closed_resolved" || status === "closed_realized";
}

export function RiskStatusActions({
  riskId,
  status,
}: {
  riskId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState<MitigationStatus | null>(null);
  const [reason, setReason] = useState("");

  if (isTerminal(status)) {
    return (
      <span className="text-ink-tertiary text-xs">
        {status.replace(/_/g, " ")} — risk is closed.
      </span>
    );
  }

  const advanceTo = ADVANCE[status] ?? null;

  function run(to: MitigationStatus, closedReason?: string) {
    setErr(null);
    start(async () => {
      try {
        await transitionRiskStatus({
          riskId,
          to,
          closedReason: closedReason?.trim() ? closedReason.trim() : null,
        });
        setClosing(null);
        setReason("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Transition failed.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {advanceTo && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(advanceTo)}
            className="text-[11px] px-2 py-0.5 rounded border bg-surface border-ink/30 text-ink hover:bg-muted/50 disabled:opacity-50"
          >
            {pending ? "…" : ADVANCE_LABEL[status] ?? "Advance"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => setClosing("closed_resolved")}
          className="text-[11px] px-2 py-0.5 rounded border bg-surface border-line-soft text-ink-secondary hover:bg-muted/40 disabled:opacity-50"
        >
          Close · resolved
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setClosing("closed_realized")}
          className="text-[11px] px-2 py-0.5 rounded border bg-surface border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-50"
        >
          Close · realized
        </button>
      </div>

      {closing && (
        <div className="rounded border border-line-soft p-2.5 space-y-2 max-w-md">
          <p className="text-xs text-ink-secondary">
            {closing === "closed_resolved"
              ? "Closing as resolved (mitigation succeeded, risk did not materialize)."
              : "Closing as realized (risk materialized despite mitigation)."}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Closure reason (optional)"
            className="w-full text-xs rounded border border-line-soft bg-surface px-2 py-1"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(closing, reason)}
              className="text-[11px] px-2 py-0.5 rounded border bg-surface border-ink/30 text-ink hover:bg-muted/50 disabled:opacity-50"
            >
              {pending ? "…" : "Confirm close"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setClosing(null);
                setReason("");
              }}
              className="text-[11px] px-2 py-0.5 rounded border bg-surface border-line-soft text-ink-secondary hover:bg-muted/40 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
