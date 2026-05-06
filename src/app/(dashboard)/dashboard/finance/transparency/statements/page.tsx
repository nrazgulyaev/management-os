import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { listTransparencyStatementRows } from "@/features/statement-transparency/services";
import { TransparencyStatusBadge } from "@/components/finance/transparency-status-badge";
import { RebuildStatementButton } from "@/components/finance/transparency-buttons";

export const metadata = { title: "Statement transparency · statements" };
export const dynamic = "force-dynamic";

export default async function TransparencyStatementsTable() {
  const rows = await listTransparencyStatementRows({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Transparency", href: "/dashboard/finance/transparency" },
          { label: "Statements" },
        ]}
        title="All statements"
        description="Per-statement transparency snapshot status + reconciliation."
      />
      <Section eyebrow="Statements" title={`${rows.length} rows`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Statement</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Reconciliation</th>
                <th className="px-4 py-3">Groups</th>
                <th className="px-4 py-3">Open</th>
                <th className="px-4 py-3">Critical</th>
                <th className="px-4 py-3">Snapshot</th>
                <th className="px-4 py-3">Last rebuild</th>
                <th className="px-4 py-3"></th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.statementCode}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{r.status}</td>
                  <td className="px-4 py-3 text-xs">{r.currency}</td>
                  <td className="px-4 py-3">
                    <TransparencyStatusBadge status={r.reconciliationStatus} />
                  </td>
                  <td className="px-4 py-3 text-xs">{r.groupCount}</td>
                  <td className="px-4 py-3 text-xs">{r.openWarningCount}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.criticalCount > 0 ? (
                      <span className="text-danger">{r.criticalCount}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.hasExplanationSnapshot ? "✓" : "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {r.lastGeneratedAt
                      ? r.lastGeneratedAt.slice(0, 16).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RebuildStatementButton statementId={r.id} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/finance/transparency/statements/${r.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
