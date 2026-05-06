import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listUtilityAccounts } from "@/features/utilities/services";
import { formatBalanceLabel } from "@/features/utilities/risk-pure";

export const metadata = { title: "Utility accounts" };
export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const rows = await listUtilityAccounts();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Utilities", href: "/dashboard/utilities" },
          { label: "Accounts" },
        ]}
        title="Utility accounts"
        description="Per-villa utility metadata, thresholds, and provider hooks. Token meter is on for prepay accounts (PLN tokens, prepaid water)."
        actions={
          <Link
            href="/dashboard/utilities/accounts/new"
            className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
          >
            + New account
          </Link>
        }
      />
      <Section eyebrow="Accounts" title={`${rows.length} accounts`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No accounts yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Provider</th>
                  <th className="text-right px-3 py-2">Low / Critical</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink font-medium">{r.villaCode ?? r.projectName ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {r.utilityType}
                      {r.tokenMeter && (
                        <Badge tone="info">token</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">{r.providerName ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">
                      {formatBalanceLabel(r.lowBalanceThresholdMinor, r.currency)} / {formatBalanceLabel(r.criticalBalanceThresholdMinor, r.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === "active" ? "success" : "neutral"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
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
          </div>
        )}
      </Section>
    </div>
  );
}
