import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
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
  tone: "success" | "danger" | "warning";
} {
  if (call.isPaid) {
    return { label: "Paid", tone: "success" };
  }
  const overdue =
    !call.isPaid && new Date(call.dueAt).getTime() < Date.now();
  if (overdue) {
    return { label: "Overdue", tone: "danger" };
  }
  return { label: "Outstanding", tone: "warning" };
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
        <h1 className="font-display text-3xl text-ink">Capital calls</h1>
        <p className="text-sm text-ink-secondary mt-1">
          {outstanding.length} outstanding · {historical.length} settled
        </p>
      </div>

      {calls.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink-secondary">
            No capital calls yet
          </p>
          <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
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
      <h2 className="text-sm uppercase tracking-wide text-ink-tertiary mb-3">
        {title}
      </h2>
      {calls.length === 0 ? (
        <div className="rounded-md border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
          {emptyLabel}
        </div>
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-wide text-ink-tertiary">
              <tr>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Project</th>
                <th className="px-4 py-2 text-right">Your share</th>
                <th className="px-4 py-2 text-left">Due</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {calls.map((c) => {
                const badge = statusBadge(c);
                return (
                  <tr key={c.allocationId} className="hover:bg-muted">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/investor-portal/capital-calls/${c.allocationId}`}
                        className="hover:underline"
                      >
                        {c.ref}
                      </Link>
                      <div className="text-[10px] text-ink-tertiary capitalize">
                        {c.kind.replace(/_/g, " ")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.projectName ?? (
                        <span className="text-ink-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdMinor(BigInt(c.allocatedUsdMinor))}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(c.dueAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
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
