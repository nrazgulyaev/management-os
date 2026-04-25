import { mockStatement, statementTotals } from "@/lib/mock/statement";
import { formatIDR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const sectionLabels: Record<string, string> = {
  revenue: "Revenue",
  fees: "Fees",
  taxes: "Taxes",
  expenses: "Operating expenses",
  shared: "Shared allocations",
  fee_mgmt: "Management fee",
  reserves: "Reserves",
};

export function OwnerStatementPreview({ editorial = true }: { editorial?: boolean }) {
  const lines = mockStatement.lines;
  const totals = statementTotals(lines);

  const grouped = [
    "revenue",
    "fees",
    "taxes",
    "expenses",
    "shared",
    "fee_mgmt",
    "reserves",
  ].map((section) => ({
    section,
    lines: lines.filter((l) => l.section === section),
    subtotal: lines
      .filter((l) => l.section === section)
      .reduce((acc, l) => acc + l.amount, 0),
  }));

  return (
    <article className="rounded-lg border border-line-soft bg-surface">
      <header className={`px-6 md:px-10 ${editorial ? "pt-10 pb-8" : "py-6"} border-b border-line-soft flex items-start justify-between flex-wrap gap-6`}>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-label">Owner statement</span>
            <Badge tone="success">Approved</Badge>
          </div>
          <h2 className="text-display text-[28px] md:text-[36px] font-medium leading-[1.05] text-ink">
            {mockStatement.villa}
          </h2>
          <p className="text-ink-secondary mt-2">
            {mockStatement.period} · {mockStatement.owner}
          </p>
          <p className="text-xs text-ink-tertiary mt-1 font-mono tabular-nums">
            {mockStatement.statementId} · hash {mockStatement.hash}
          </p>
        </div>
        <div className="text-right">
          <div className="text-label">Net owner payout</div>
          <div className="text-display text-[32px] md:text-[44px] font-medium tabular-nums mt-1 text-accent">
            {formatIDR(totals.net)}
          </div>
          <div className="text-xs text-ink-tertiary mt-1">
            {mockStatement.periodRange}
          </div>
        </div>
      </header>

      <div className="px-6 md:px-10 pb-10 pt-6 flex flex-col gap-8">
        {grouped.map((group) =>
          group.lines.length > 0 ? (
            <section key={group.section} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between border-b border-line-soft pb-2">
                <span className="text-label">{sectionLabels[group.section]}</span>
                <span className="font-mono tabular-nums text-sm text-ink">
                  {formatIDR(group.subtotal)}
                </span>
              </div>
              {group.lines.map((line, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] gap-6 py-1.5"
                >
                  <div>
                    <div className="text-sm text-ink">{line.label}</div>
                    {line.hint && (
                      <div className="text-xs text-ink-tertiary mt-0.5">
                        {line.hint}
                      </div>
                    )}
                  </div>
                  <div
                    className={`font-mono tabular-nums text-sm text-right whitespace-nowrap ${line.amount < 0 ? "text-ink-secondary" : "text-ink"}`}
                  >
                    {formatIDR(line.amount)}
                  </div>
                </div>
              ))}
            </section>
          ) : null
        )}

        <div className="border-t border-ink pt-5 flex items-baseline justify-between">
          <span className="text-display text-[20px] font-medium text-ink">
            Net owner payout
          </span>
          <span className="text-display text-[28px] font-medium tabular-nums text-accent">
            {formatIDR(totals.net)}
          </span>
        </div>

        <p className="text-xs text-ink-tertiary leading-relaxed">
          Prepared by {mockStatement.approvedBy}. Signed and hashed on publish —
          any modification produces an amendment, never a silent rewrite. Each
          line drills down to source transactions in the Arconique ledger.
        </p>
      </div>
    </article>
  );
}
