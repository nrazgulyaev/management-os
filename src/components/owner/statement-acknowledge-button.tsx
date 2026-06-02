"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AcknowledgeModal } from "@/components/owner-portal/acknowledge-modal";
import { acknowledgeStatementAction } from "@/features/owner-statements/actions";

/**
 * Client wrapper wiring the AcknowledgeModal to acknowledgeStatementAction
 * (FC-OWNER-STATEMENTS §2 #5). When the statement can no longer be
 * acknowledged (already acked / auto-acked / disputed / superseded) it renders
 * a terminal pill instead of the button.
 */
export function StatementAcknowledgeButton({
  statementId,
  statementCode,
  netAmount,
  currency,
  canAcknowledge,
  terminalLabel,
}: {
  statementId: string;
  statementCode: string;
  netAmount: number;
  currency: string;
  canAcknowledge: boolean;
  /** Shown when canAcknowledge is false (e.g. "ACKNOWLEDGED", "AUTO-ACKED"). */
  terminalLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!canAcknowledge) {
    if (!terminalLabel) return null;
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ink-tertiary">
        <span className="badge badge-ok text-[9px]">{terminalLabel}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-accent btn-sm self-start"
        onClick={() => setOpen(true)}
      >
        Acknowledge
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
      <AcknowledgeModal
        open={open}
        onOpenChange={setOpen}
        statementCode={statementCode}
        netAmount={netAmount}
        currency={currency}
        onConfirm={async () => {
          setError(null);
          const res = await acknowledgeStatementAction(statementId);
          if (!res.ok) {
            setError(res.error ?? "Could not acknowledge.");
            return;
          }
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
