import { Section } from "@/components/ui/section";
import type { StatementSourceGroupLine } from "@/lib/db/schema/statement-transparency";

/**
 * Internal-only — shows source_table / source_id for traceability.  Must
 * not embed payment provider payloads, webhook bodies, encrypted
 * config, or token hashes.
 */
export function AdminSourceTraceCard({
  groupLines,
}: {
  groupLines: StatementSourceGroupLine[];
}) {
  return (
    <Section
      eyebrow="Source trace"
      title="Internal traceability"
      description="Each statement line maps back to a source ledger row. Owner-facing pages never see this panel."
    >
      <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-canvas/50 text-left">
            <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Owner-visible label</th>
              <th className="px-4 py-3">Source table</th>
              <th className="px-4 py-3">Source ID</th>
              <th className="px-4 py-3">Trace status</th>
            </tr>
          </thead>
          <tbody>
            {groupLines.map((l) => (
              <tr key={l.id} className="border-t border-line-soft">
                <td className="px-4 py-2 capitalize">
                  {l.groupKey.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-2">{l.ownerVisibleLabel}</td>
                <td className="px-4 py-2 font-mono text-ink-tertiary">
                  {l.internalSourceTable ?? "—"}
                </td>
                <td className="px-4 py-2 font-mono text-ink-tertiary">
                  {l.internalSourceId
                    ? `${l.internalSourceId.slice(0, 8)}…`
                    : "—"}
                </td>
                <td className="px-4 py-2 capitalize">
                  {l.sourceTraceStatus.replace(/_/g, " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
