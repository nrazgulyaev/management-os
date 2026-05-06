import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { StatementStatusPill } from "@/components/finance/period-pill";
import { formatMoneyMinor } from "@/lib/money";
import { generateStatementExplanation } from "@/features/finance/explanation";
import { groupStatementLinesBySource } from "@/features/owner-bookings/statement-source-groups";
import type {
  OwnerStatementRow,
  StatementLineRow,
} from "@/features/finance/services";

const sectionLabels: Record<string, string> = {
  revenue: "Revenue",
  fee: "Fees",
  expense: "Operating expenses",
  tax: "Taxes",
  reserve: "Reserves",
  management_fee: "Management fee",
  payout: "Payout",
  adjustment: "Adjustments",
};

const sectionOrder = [
  "revenue",
  "fee",
  "tax",
  "expense",
  "reserve",
  "management_fee",
  "adjustment",
];

export function StatementDetail({
  statement,
  lines,
  audience = "internal",
}: {
  statement: OwnerStatementRow;
  lines: StatementLineRow[];
  audience?: "internal" | "owner";
}) {
  const visibleLines = audience === "owner" ? lines.filter((l) => l.ownerVisible) : lines;
  const grouped = sectionOrder
    .map((s) => ({
      section: s,
      lines: visibleLines.filter((l) => l.lineType === s),
    }))
    .filter((g) => g.lines.length > 0);

  const subtotal = (rows: StatementLineRow[]) =>
    rows.reduce<bigint>((acc, r) => acc + r.amountMinor, 0n);

  return (
    <article className="rounded-lg border border-line-soft bg-surface">
      <header className="px-6 md:px-10 pt-10 pb-8 border-b border-line-soft flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-label">Owner statement</span>
            <StatementStatusPill status={statement.status} />
            <Badge tone="outline">{statement.managementModel}</Badge>
          </div>
          <h2 className="text-display text-[28px] md:text-[36px] font-medium leading-[1.05] text-ink">
            {statement.villaCode ?? statement.projectName ?? statement.ownerName}
          </h2>
          <p className="text-ink-secondary mt-2">
            {statement.periodLabel} · {statement.ownerName}
          </p>
          <p className="text-xs text-ink-tertiary mt-1 font-mono tabular-nums">
            {statement.statementCode}
          </p>
        </div>
        <div className="text-right">
          <div className="text-label">Net owner payout</div>
          <div className="text-display text-[32px] md:text-[44px] font-medium tabular-nums mt-1 text-accent">
            {formatMoneyMinor(statement.netPayoutMinor, statement.currency)}
          </div>
          <div className="text-xs text-ink-tertiary mt-1">
            {statement.periodStart} → {statement.periodEnd}
          </div>
        </div>
      </header>

      {(statement.occupancyRate !== null ||
        statement.adrMinor !== null ||
        statement.revparMinor !== null) && (
        <div className="px-6 md:px-10 py-5 border-b border-line-soft grid grid-cols-3 gap-4">
          <Stat label="Occupancy" value={statement.occupancyRate !== null ? `${(statement.occupancyRate * 100).toFixed(1)}%` : "—"} />
          <Stat
            label="ADR"
            value={statement.adrMinor !== null ? formatMoneyMinor(statement.adrMinor, statement.currency) : "—"}
          />
          <Stat
            label="RevPAR"
            value={statement.revparMinor !== null ? formatMoneyMinor(statement.revparMinor, statement.currency) : "—"}
          />
        </div>
      )}

      <div className="px-6 md:px-10 pb-10 pt-6 flex flex-col gap-8">
        {grouped.length === 0 && (
          <p className="text-sm text-ink-tertiary">
            No allocated lines for this statement. Try regenerating from the source ledger.
          </p>
        )}
        {grouped.map((group) => (
          <section key={group.section} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between border-b border-line-soft pb-2">
              <span className="text-label">{sectionLabels[group.section] ?? group.section}</span>
              <span className="font-mono tabular-nums text-sm text-ink">
                {formatMoneyMinor(subtotal(group.lines), statement.currency)}
              </span>
            </div>
            {group.lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_auto] gap-6 py-1.5">
                <div>
                  <div className="text-sm text-ink">{line.description}</div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">{line.category}</div>
                </div>
                <div
                  className={`font-mono tabular-nums text-sm text-right whitespace-nowrap ${line.amountMinor < 0n ? "text-ink-secondary" : "text-ink"}`}
                >
                  {formatMoneyMinor(line.amountMinor, line.currency)}
                </div>
              </div>
            ))}
          </section>
        ))}

        <div className="border-t border-ink pt-5 flex items-baseline justify-between">
          <span className="text-display text-[20px] font-medium text-ink">Net owner payout</span>
          <span className="text-display text-[28px] font-medium tabular-nums text-accent">
            {formatMoneyMinor(statement.netPayoutMinor, statement.currency)}
          </span>
        </div>

        <Section
          eyebrow="By source"
          title="Revenue source explanation"
          description="Each booking on your statement is attributed to a source — direct booking, OTA platform, guest service, or owner stay. Source IDs are intentionally hidden."
        >
          {(() => {
            const buckets = groupStatementLinesBySource(visibleLines);
            if (buckets.length === 0) {
              return (
                <p className="text-sm text-ink-tertiary">
                  No source-bucketed lines on this statement.
                </p>
              );
            }
            return (
              <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-4">
                {buckets.map((b) => (
                  <SourceBucket key={b.key} bucket={b} />
                ))}
              </div>
            );
          })()}
        </Section>

        <Section eyebrow="Why this number" title="Plain-language explanation">
          {(() => {
            const expl = generateStatementExplanation(statement, lines);
            return (
              <div className="rounded-md border border-line-soft bg-muted/30 p-5 flex flex-col gap-3">
                <p className="text-sm font-medium text-ink">{expl.headline}</p>
                <ul className="flex flex-col gap-1.5">
                  {expl.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="text-sm text-ink-secondary leading-relaxed flex items-start gap-2"
                    >
                      <span className="w-1 h-1 rounded-full bg-ink-tertiary mt-2 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-ink-tertiary border-t border-line-soft pt-2">
                  Deterministic explanation — no AI inference. {expl.footer}
                </p>
              </div>
            );
          })()}
        </Section>

        <Section
          eyebrow="Source traceability"
          title="Every line maps back to a posted ledger row"
        >
          <p className="text-sm text-ink-secondary leading-relaxed">
            Each row above carries an internal reference to the posted source —
            revenue lines, fee lines, expense allocations, tax lines, reserve
            movements, or a management-fee rule. Regenerating a draft replays
            the source rows and restates the lines. Issued statements are
            immutable; corrections produce a new statement.
          </p>
        </Section>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="font-mono tabular-nums text-base text-ink mt-1">{value}</div>
    </div>
  );
}

function SourceBucket({
  bucket,
}: {
  bucket: ReturnType<typeof groupStatementLinesBySource>[number];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm text-ink font-medium">{bucket.label}</div>
          <div className="text-[11px] text-ink-tertiary">
            {bucket.description}
          </div>
        </div>
        {bucket.currency && (
          <div className="font-mono tabular-nums text-sm text-ink">
            {formatMoneyMinor(bucket.totalMinor, bucket.currency)}
          </div>
        )}
      </div>
    </div>
  );
}
