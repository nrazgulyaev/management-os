import Link from "next/link";
import { listTransparencyStatementRows } from "@/features/statement-transparency/services";
import { TransparencyStatusBadge } from "@/components/finance/transparency-status-badge";
import { RebuildStatementButton } from "@/components/finance/transparency-buttons";

export const metadata = { title: "Statement transparency · statements" };
export const dynamic = "force-dynamic";

export default async function TransparencyStatementsTable() {
  const rows = await listTransparencyStatementRows({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/transparency">Transparency</Link> /{" "}
            <span>Statements</span>
          </div>
          <h1>All statements</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-statement transparency snapshot status + reconciliation.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`Statements · ${rows.length} rows`}</div>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Statement</th>
              <th scope="col">Status</th>
              <th scope="col">Currency</th>
              <th scope="col">Reconciliation</th>
              <th scope="col" className="num">Groups</th>
              <th scope="col" className="num">Open</th>
              <th scope="col" className="num">Critical</th>
              <th scope="col">Snapshot</th>
              <th scope="col">Last rebuild</th>
              <th scope="col"></th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[12px]">{r.statementCode}</td>
                <td className="text-[12px] capitalize">{r.status}</td>
                <td className="text-[12px]">{r.currency}</td>
                <td>
                  <TransparencyStatusBadge status={r.reconciliationStatus} />
                </td>
                <td className="num text-[12px]">{r.groupCount}</td>
                <td className="num text-[12px]">{r.openWarningCount}</td>
                <td className="num text-[12px]">
                  {r.criticalCount > 0 ? (
                    <span className="text-danger">{r.criticalCount}</span>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="text-[12px]">
                  {r.hasExplanationSnapshot ? "✓" : "—"}
                </td>
                <td className="text-[11px] text-ink-3">
                  {r.lastGeneratedAt
                    ? r.lastGeneratedAt.slice(0, 16).replace("T", " ")
                    : "—"}
                </td>
                <td>
                  <RebuildStatementButton statementId={r.id} />
                </td>
                <td className="text-right">
                  <Link
                    href={`/dashboard/finance/transparency/statements/${r.id}`}
                    className="text-[12px] text-ink hover:text-terra"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
