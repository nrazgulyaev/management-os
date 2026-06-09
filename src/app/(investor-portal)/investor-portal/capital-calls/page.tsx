import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import {
  getMyCapitalCalls,
  type LpCapitalCallListItem,
} from "@/lib/investor-portal/capital-calls-queries";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Capital calls · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

function statusBadge(call: LpCapitalCallListItem): {
  label: string;
  className: string;
} {
  if (call.isPaid) {
    return { label: "Paid", className: "bg-emerald-100 text-emerald-800" };
  }
  const overdue =
    !call.isPaid && new Date(call.dueAt).getTime() < Date.now();
  if (overdue) {
    return { label: "Overdue", className: "bg-red-100 text-red-800" };
  }
  return { label: "Outstanding", className: "bg-amber-100 text-amber-800" };
}

export default async function CapitalCallsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const calls = await getMyCapitalCalls();

  const outstanding = calls.filter((c) => !c.isPaid);
  const historical = calls.filter((c) => c.isPaid);

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <h1 className="font-display text-3xl text-stone-900">Capital calls</h1>
        <p className="text-sm text-stone-600 mt-1">
          {outstanding.length} outstanding · {historical.length} settled
        </p>
      </div>

      {calls.length === 0 ? (
        <div className="rounded-md border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-700">
            No capital calls yet
          </p>
          <p className="text-xs text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
            When Arconique issues a capital call against one of your
            commitments, your pro-rata share will appear here with the amount
            due, the due date, and a way to confirm your wire.
          </p>
        </div>
      ) : (
        <>
          <Section
            title="Outstanding"
            calls={outstanding}
            emptyLabel="Nothing outstanding — you're all paid up."
          />
          <Section
            title="History"
            calls={historical}
            emptyLabel="No settled calls yet."
          />
        </>
      )}
    </PortalShell>
  );
}

function Section({
  title,
  calls,
  emptyLabel,
}: {
  title: string;
  calls: LpCapitalCallListItem[];
  emptyLabel: string;
}) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wide text-stone-500 mb-3">
        {title}
      </h2>
      {calls.length === 0 ? (
        <div className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
          {emptyLabel}
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Project</th>
                <th className="px-4 py-2 text-right">Your share</th>
                <th className="px-4 py-2 text-left">Due</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {calls.map((c) => {
                const badge = statusBadge(c);
                return (
                  <tr key={c.allocationId} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/investor-portal/capital-calls/${c.allocationId}`}
                        className="hover:underline"
                      >
                        {c.ref}
                      </Link>
                      <div className="text-[10px] text-stone-500 capitalize">
                        {c.kind.replace(/_/g, " ")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.projectName ?? (
                        <span className="text-stone-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdMinor(BigInt(c.allocatedUsdMinor))}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(c.dueAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
