"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DisputeModal, type DisputeValues } from "@/components/owner-portal/dispute-modal";
import { raiseStatementDisputeAction } from "@/features/owner-portal/dispute-actions";

/**
 * Client wrapper that wires the existing DisputeModal to the
 * raiseStatementDisputeAction server action. Rendered on the owner
 * statement detail page. When the statement already has an open dispute,
 * shows a disabled "Dispute open" state instead.
 */
export function StatementDisputeButton({
  statementId,
  statementCode,
  alreadyDisputed = false,
}: {
  statementId: string;
  statementCode: string;
  alreadyDisputed?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (alreadyDisputed) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ink-tertiary">
        <span className="badge badge-gold text-[9px]">DISPUTE OPEN</span>
        A dispute is in progress — see your inbox.
      </span>
    );
  }

  async function handleSubmit(values: DisputeValues) {
    setError(null);
    const fd = new FormData();
    fd.set("statementId", values.statementId);
    fd.set("reasonKind", values.reasonKind);
    fd.set("detail", values.detail);
    const res = await raiseStatementDisputeAction(null, fd);
    if (!res.ok) {
      setError(res.error ?? "Could not open the dispute.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm self-start"
        onClick={() => setOpen(true)}
      >
        Raise a dispute
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
      <DisputeModal
        open={open}
        onOpenChange={setOpen}
        statementId={statementId}
        statementCode={statementCode}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
