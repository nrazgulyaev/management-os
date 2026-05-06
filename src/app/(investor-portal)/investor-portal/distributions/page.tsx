import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyDistributions } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Distributions · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalDistributionsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const list = await getMyDistributions();

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <h1 className="font-display text-3xl text-stone-900">
          {strings.navDistributions}
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          {list.length} distribution{list.length === 1 ? "" : "s"} where you
          received an allocation
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
          No distributions yet. When Arconique declares one for a project you
          have a commitment in, it will appear here.
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">{strings.project}</th>
                <th className="px-4 py-2 text-left">{strings.type}</th>
                <th className="px-4 py-2 text-right">Total amount</th>
                <th className="px-4 py-2 text-left">Effective</th>
                <th className="px-4 py-2 text-left">{strings.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.map((d) => (
                <tr key={d.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/investor-portal/distributions/${d.id}`}
                      className="hover:underline"
                    >
                      #{d.distributionNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {d.projectName ?? (
                      <span className="text-stone-500">Company-wide</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {DISTRIBUTION_TYPE_LABEL[d.distributionType]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatUsdMinor(BigInt(d.totalAmountUsdMinor))}
                  </td>
                  <td className="px-4 py-3 text-xs">{d.effectiveDate}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        d.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : d.status === "declared"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-stone-100 text-stone-700"
                      }`}
                    >
                      {DISTRIBUTION_STATUS_LABEL[d.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  );
}
