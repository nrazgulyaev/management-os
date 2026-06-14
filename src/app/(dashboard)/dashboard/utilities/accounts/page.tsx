import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listUtilityAccounts } from "@/features/utilities/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { formatBalanceLabel } from "@/features/utilities/risk-pure";
import { UtilityAccountAddButton } from "@/components/utilities/account-add-button";

export const metadata = { title: "Utility accounts" };
export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [rows, villas, projects] = await Promise.all([
    listUtilityAccounts(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName ?? ""}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <span>Accounts</span>
          </div>
          <h1>Utility accounts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-villa utility metadata, thresholds, and provider hooks. Token meter is on for prepay accounts (PLN tokens, prepaid water).
          </p>
        </div>
        <div className="actions">
          <UtilityAccountAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Accounts</div>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No accounts yet.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Villa</th>
                <th scope="col">Type</th>
                <th scope="col">Provider</th>
                <th scope="col" className="num">Low / Critical</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="row-title">{r.villaCode ?? r.projectName ?? "—"}</td>
                  <td>
                    {r.utilityType}
                    {r.tokenMeter && (
                      <HandoffBadge tone="info">token</HandoffBadge>
                    )}
                  </td>
                  <td className="text-ink-3 text-xs">{r.providerName ?? "—"}</td>
                  <td className="num text-ink-3">
                    {formatBalanceLabel(r.lowBalanceThresholdMinor, r.currency)} / {formatBalanceLabel(r.criticalBalanceThresholdMinor, r.currency)}
                  </td>
                  <td>
                    <HandoffBadge tone={r.status === "active" ? "ok" : "soft"}>
                      {r.status}
                    </HandoffBadge>
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/utilities/accounts/${r.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Detail →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
