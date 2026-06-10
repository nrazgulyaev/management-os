import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import {
  PortalAlert,
  PortalEmpty,
  PortalKpi,
  PortalPageHeader,
  PortalTableCard,
  PortalTh,
} from "@/components/investor-portal/portal-primitives";
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
  const overdue = !call.isPaid && new Date(call.dueAt).getTime() < Date.now();
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

  const outstandingMinor = outstanding.reduce((sum, c) => {
    const remaining =
      BigInt(c.allocatedUsdMinor) - BigInt(c.receivedUsdMinor);
    return sum + (remaining > 0n ? remaining : 0n);
  }, 0n);
  // Soonest-due outstanding call drives the alert band + "next due" KPI.
  const nextDue = [...outstanding].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  )[0];

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Capital calls"
    >
      <PortalPageHeader
        eyebrow="Capital calls"
        title="Capital calls"
        sub="Pro-rata share of each call against your commitments"
      />

      {calls.length === 0 ? (
        <PortalEmpty
          title="No capital calls yet"
          body="When Arconique issues a capital call against one of your commitments, your pro-rata share will appear here with the amount due, the due date, and a way to confirm your wire."
        />
      ) : (
        <>
          {nextDue ? (
            <div className="mb-5">
              <PortalAlert
                icon={<Clock className="h-[22px] w-[22px]" strokeWidth={1.8} />}
                title={`Due: ${formatUsdMinor(outstandingMinor)}`}
                sub={`${nextDue.ref}${
                  nextDue.projectName ? ` · ${nextDue.projectName}` : ""
                } · due ${new Date(nextDue.dueAt).toLocaleDateString()}`}
                actions={
                  <Link
                    href={`/investor-portal/capital-calls/${nextDue.allocationId}`}
                    className="inline-flex items-center justify-center rounded-lg bg-amber px-[18px] py-2.5 text-[13.5px] font-semibold text-white transition-[filter] hover:brightness-105"
                  >
                    Pay now
                  </Link>
                }
              />
            </div>
          ) : null}

          <section className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <PortalKpi
              label="Outstanding"
              value={formatUsdMinor(outstandingMinor)}
              hint={`${outstanding.length} call${outstanding.length === 1 ? "" : "s"} due`}
              tone={outstanding.length > 0 ? "amber" : "default"}
            />
            <PortalKpi
              label="Settled"
              value={String(historical.length)}
              hint="paid in full"
            />
            <PortalKpi
              label="Next due"
              value={
                nextDue ? new Date(nextDue.dueAt).toLocaleDateString() : "—"
              }
              hint={nextDue?.projectName ?? "Nothing outstanding"}
            />
          </section>

          <Section
            title="Outstanding"
            calls={outstanding}
            emptyLabel="Nothing outstanding — you're all paid up."
          />
          <div className="mt-5">
            <Section
              title="History"
              calls={historical}
              emptyLabel="No settled calls yet."
            />
          </div>
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
  if (calls.length === 0) {
    return (
      <section>
        <div className="overflow-hidden rounded-[18px] border border-line bg-panel shadow-soft-card">
          <div className="px-[22px] pb-2 pt-[22px]">
            <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              {title}
            </h3>
          </div>
          <p className="px-[22px] pb-[22px] text-sm text-ink-3">{emptyLabel}</p>
        </div>
      </section>
    );
  }
  return (
    <section>
      <PortalTableCard title={title}>
        <thead>
          <tr>
            <PortalTh>Reference</PortalTh>
            <PortalTh>Project</PortalTh>
            <PortalTh align="right">Your share</PortalTh>
            <PortalTh>Due</PortalTh>
            <PortalTh>Status</PortalTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft text-[13.5px] text-ink-2">
          {calls.map((c) => {
            const badge = statusBadge(c);
            return (
              <tr key={c.allocationId} className="transition-colors hover:bg-bg-3">
                <td className="px-4 py-3.5 font-mono text-xs font-semibold text-ink">
                  <Link
                    href={`/investor-portal/capital-calls/${c.allocationId}`}
                    className="hover:underline"
                  >
                    {c.ref}
                  </Link>
                  <div className="font-mono text-[10px] capitalize text-ink-4">
                    {c.kind.replace(/_/g, " ")}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {c.projectName ?? <span className="text-ink-4">—</span>}
                </td>
                <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums text-ink">
                  {formatUsdMinor(BigInt(c.allocatedUsdMinor))}
                </td>
                <td className="px-4 py-3.5">
                  {new Date(c.dueAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </PortalTableCard>
    </section>
  );
}
