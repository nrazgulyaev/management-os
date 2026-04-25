import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { mockStatement, statementTotals } from "@/lib/mock/statement";
import { Badge } from "@/components/ui/badge";
import { formatIDR } from "@/lib/utils";

export function FinanceSummary() {
  const totals = statementTotals(mockStatement.lines);

  return (
    <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
      <div className="p-6 border-b border-line-soft flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-label">Owner statement · demo</span>
            <Badge tone="gold">Draft</Badge>
          </div>
          <h3 className="text-display text-[26px] font-medium mt-2">
            {mockStatement.villa} · {mockStatement.period}
          </h3>
          <p className="text-sm text-ink-secondary mt-1">
            Owner: {mockStatement.owner} · {mockStatement.project}
          </p>
        </div>
        <div className="text-right">
          <div className="text-label">Net owner payout</div>
          <div className="text-display text-[34px] tabular-nums font-medium mt-1 text-accent">
            {formatIDR(totals.net)}
          </div>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Line</TH>
            <TH className="text-right">Amount</TH>
          </TR>
        </THead>
        <TBody>
          {mockStatement.lines.map((line, i) => {
            const isNegative = line.amount < 0;
            return (
              <TR key={i}>
                <TD>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-ink">{line.label}</span>
                    {line.hint && (
                      <span className="text-xs text-ink-tertiary">
                        {line.hint}
                      </span>
                    )}
                  </div>
                </TD>
                <TDNum className={isNegative ? "text-ink-secondary" : "text-ink"}>
                  {formatIDR(line.amount)}
                </TDNum>
              </TR>
            );
          })}
          <TR className="bg-muted/60">
            <TD className="font-medium">Net owner payout</TD>
            <TDNum className="font-semibold text-accent">
              {formatIDR(totals.net)}
            </TDNum>
          </TR>
        </TBody>
      </Table>

      <div className="p-6 border-t border-line-soft flex items-center justify-between gap-4 flex-wrap text-xs text-ink-tertiary">
        <span>
          Signed: {mockStatement.approvedBy} · Hash {mockStatement.hash}
        </span>
        <span className="tabular-nums">{mockStatement.statementId}</span>
      </div>
    </div>
  );
}
