import { Section } from "@/components/ui/section";
import { formatMoneyMinor } from "@/lib/money";
import type { StatementSourceGroup, StatementSourceGroupLine } from "@/lib/db/schema/statement-transparency";

export function StatementSourceBreakdown({
  groups,
  groupLines,
  audience = "owner",
}: {
  groups: StatementSourceGroup[];
  groupLines: StatementSourceGroupLine[];
  audience?: "owner" | "internal";
}) {
  const visible =
    audience === "owner"
      ? groups.filter((g) => g.ownerVisible)
      : groups;
  if (visible.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        No source breakdown is available yet for this statement. Run the
        rebuild action from the admin transparency hub if this statement
        should be classified.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {visible.map((g) => {
        const lines = groupLines.filter(
          (l) => l.statementSourceGroupId === g.id,
        );
        return (
          <Section
            key={g.id}
            eyebrow={g.groupKey.replace(/_/g, " ")}
            title={g.groupLabel}
            description={g.groupDescription ?? undefined}
            action={
              <span className="font-mono tabular-nums text-sm text-ink">
                {formatMoneyMinor(g.netAmountMinor, g.currency)}
              </span>
            }
          >
            {lines.length === 0 ? (
              <p className="text-xs text-ink-tertiary">
                No line items in this group.
              </p>
            ) : (
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                {lines.map((l) => (
                  <li
                    key={l.id}
                    className="px-4 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="text-ink">{l.ownerVisibleLabel}</span>
                    <span className="text-ink-tertiary capitalize">
                      {l.sourceTraceStatus.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-3 gap-3 text-[11px] text-ink-tertiary">
              <div>
                Gross{" "}
                <span className="text-ink font-mono ml-1">
                  {formatMoneyMinor(g.grossAmountMinor, g.currency)}
                </span>
              </div>
              <div>
                Deductions{" "}
                <span className="text-ink font-mono ml-1">
                  {formatMoneyMinor(g.deductionAmountMinor, g.currency)}
                </span>
              </div>
              <div>
                Lines{" "}
                <span className="text-ink ml-1">{g.lineCount}</span>
              </div>
            </div>
          </Section>
        );
      })}
    </div>
  );
}
