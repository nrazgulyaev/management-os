import { Section } from "@/components/ui/section";
import { SectionPill, type StatementSection } from "@/components/finance/section-pill";
import { Card } from "@/components/dashboard/primitives";
import { formatMoneyMinor } from "@/lib/money";
import { generateStatementExplanation } from "@/features/finance/explanation";
import { groupStatementLinesBySource } from "@/features/owner-bookings/statement-source-groups";
import type {
  OwnerStatementRow,
  StatementLineRow,
} from "@/features/finance/services";

/** Map a ledger `line_type` onto the mockup's 7 section-pill tones. */
const LINE_SECTION: Record<string, StatementSection> = {
  revenue: "revenue",
  fee: "fees",
  tax: "taxes",
  expense: "expenses",
  reserve: "reserves",
  management_fee: "mgmt",
  payout: "expenses",
  adjustment: "shared",
};

/** Canonical render order — revenue first, then deductions, mockup order. */
const SECTION_ORDER: StatementLineRow["lineType"][] = [
  "revenue",
  "fee",
  "tax",
  "expense",
  "reserve",
  "management_fee",
  "adjustment",
  "payout",
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
  const ordered = SECTION_ORDER.flatMap((t) =>
    visibleLines.filter((l) => l.lineType === t),
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Mock: the line table IS the screen — flat table.data, one
          section-pill per line, terra net-to-owner footer row. */}
      <Card padding="none" overflowHidden>
        {ordered.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No allocated lines for this statement. Try regenerating from the
            source ledger.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col" className="w-[130px]">Section</th>
                <th scope="col">Line item</th>
                <th scope="col">Notes</th>
                <th scope="col" className="num">Amount ({statement.currency})</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((line) => {
                const positive = line.amountMinor >= 0n;
                return (
                  <tr key={line.id}>
                    <td>
                      <SectionPill kind={LINE_SECTION[line.lineType] ?? "shared"} />
                    </td>
                    <td className="font-medium">{line.description}</td>
                    <td className="mono text-[11px] text-ink-3">{line.category}</td>
                    <td className={"num " + (positive ? "text-ok" : "text-ink-2")}>
                      {formatMoneyMinor(line.amountMinor, line.currency)}
                    </td>
                  </tr>
                );
              })}
              <tr className="stmt-foot">
                <td colSpan={2}>
                  <span className="stmt-foot-label">
                    Net to owner · {statement.periodLabel}
                  </span>
                </td>
                <td className="mono text-[11px] text-ink-3">
                  {statement.periodStart} → {statement.periodEnd}
                </td>
                <td className="num">
                  <span className="stmt-foot-value">
                    {formatMoneyMinor(statement.netPayoutMinor, statement.currency)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      {(statement.occupancyRate !== null ||
        statement.adrMinor !== null ||
        statement.revparMinor !== null) && (
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Occupancy"
            value={statement.occupancyRate !== null ? `${(statement.occupancyRate * 100).toFixed(1)}%` : "—"}
          />
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

      <Section
        eyebrow="By source"
        title="Revenue source explanation"
        description="Each booking on your statement is attributed to a source — direct booking, OTA platform, guest service, or owner stay. Source IDs are intentionally hidden."
      >
        {(() => {
          const buckets = groupStatementLinesBySource(visibleLines);
          if (buckets.length === 0) {
            return (
              <p className="text-sm text-ink-3">
                No source-bucketed lines on this statement.
              </p>
            );
          }
          return (
            <Card padding="default" className="flex flex-col gap-4">
              {buckets.map((b) => (
                <SourceBucket key={b.key} bucket={b} />
              ))}
            </Card>
          );
        })()}
      </Section>

      <Section eyebrow="Why this number" title="Plain-language explanation">
        {(() => {
          const expl = generateStatementExplanation(statement, lines);
          return (
            <Card padding="default" className="bg-cream-warm flex flex-col gap-3">
              <p className="text-sm font-medium text-ink">{expl.headline}</p>
              <ul className="flex flex-col gap-1.5">
                {expl.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="text-sm text-ink-2 leading-relaxed flex items-start gap-2"
                  >
                    <span className="w-1 h-1 rounded-full bg-ink-4 mt-2 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-3 border-t border-line-soft pt-2">
                Deterministic explanation — no AI inference. {expl.footer}
              </p>
            </Card>
          );
        })()}
      </Section>

      <Section
        eyebrow="Source traceability"
        title="Every line maps back to a posted ledger row"
      >
        <p className="text-sm text-ink-2 leading-relaxed">
          Each row above carries an internal reference to the posted source —
          revenue lines, fee lines, expense allocations, tax lines, reserve
          movements, or a management-fee rule. Regenerating a draft replays the
          source rows and restates the lines. Issued statements are immutable;
          corrections produce a new statement.
        </p>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mono tabular-nums text-base text-ink mt-1">{value}</div>
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
          <div className="text-[11px] text-ink-3">{bucket.description}</div>
        </div>
        {bucket.currency && (
          <div className="mono tabular-nums text-sm text-ink">
            {formatMoneyMinor(bucket.totalMinor, bucket.currency)}
          </div>
        )}
      </div>
    </div>
  );
}
