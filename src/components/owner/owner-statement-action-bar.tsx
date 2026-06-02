import * as React from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { StatementAcknowledgeButton } from "@/components/owner/statement-acknowledge-button";
import { StatementDisputeButton } from "@/components/owner/statement-dispute-button";

/**
 * owner-02 — sticky action bar (Download / Dispute / Acknowledge), per the
 * mockup's 3-action footer. Composes the existing wired buttons; the auto-ack
 * countdown note sits on the left.
 */
export function OwnerStatementActionBar({
  statementId,
  statementCode,
  netAmount,
  currency,
  canAcknowledge,
  terminalLabel,
  alreadyDisputed,
  note,
}: {
  statementId: string;
  statementCode: string;
  netAmount: number;
  currency: string;
  canAcknowledge: boolean;
  terminalLabel?: string;
  alreadyDisputed: boolean;
  note?: React.ReactNode;
}) {
  return (
    <div className="owner-actionbar">
      {note && <div className="ab-note">{note}</div>}
      <div className="ab-spacer" />
      <Button asChild variant="secondary" size="sm">
        <a
          href={`/owner/statements/${statementId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
          Download PDF
        </a>
      </Button>
      <StatementDisputeButton
        statementId={statementId}
        statementCode={statementCode}
        alreadyDisputed={alreadyDisputed}
      />
      <StatementAcknowledgeButton
        statementId={statementId}
        statementCode={statementCode}
        netAmount={netAmount}
        currency={currency}
        canAcknowledge={canAcknowledge}
        terminalLabel={terminalLabel}
      />
    </div>
  );
}
