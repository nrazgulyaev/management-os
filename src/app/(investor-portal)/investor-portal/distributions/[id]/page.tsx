import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getMyDistributionAllocation,
  getMyDistributions,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Distribution · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalDistributionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const list = await getMyDistributions();
  const distribution = list.find((d) => d.id === id);
  if (!distribution) notFound();
  const myAllocation = await getMyDistributionAllocation(id);

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <Link
          href="/investor-portal/distributions"
          className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink mb-3"
        >
          <ArrowLeft className="w-3 h-3" /> {strings.navDistributions}
        </Link>
        <h1 className="font-display text-2xl text-ink">
          {DISTRIBUTION_TYPE_LABEL[distribution.distributionType]} #
          {distribution.distributionNumber}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {distribution.projectName ?? "Company-wide"} · effective{" "}
          {distribution.effectiveDate}
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Total distributed"
          value={formatUsdMinor(BigInt(distribution.totalAmountUsdMinor))}
        />
        <Stat
          label="My allocation"
          value={
            myAllocation
              ? formatUsdMinor(BigInt(myAllocation.totalAmountUsdMinor))
              : "—"
          }
        />
        <Stat
          label="My capital return"
          value={
            myAllocation
              ? formatUsdMinor(BigInt(myAllocation.capitalReturnAmountUsdMinor))
              : "—"
          }
        />
        <Stat
          label="My profit share"
          value={
            myAllocation
              ? formatUsdMinor(BigInt(myAllocation.profitAmountUsdMinor))
              : "—"
          }
        />
      </section>

      <div className="text-xs text-ink-tertiary flex items-center gap-2">
        Status:{" "}
        <Badge tone={distribution.status === "completed" ? "success" : "warning"}>
          {DISTRIBUTION_STATUS_LABEL[distribution.status]}
        </Badge>
      </div>

      {myAllocation && myAllocation.status === "executed" && (
        <p className="text-sm text-ink-secondary">
          This allocation was credited to your wallet on{" "}
          {myAllocation.executedAt
            ? new Date(myAllocation.executedAt).toLocaleString()
            : "—"}
          . You can{" "}
          <Link
            href={`/investor-portal/wallet/${myAllocation.commitmentId}`}
            className="underline hover:text-ink"
          >
            view your wallet ledger
          </Link>{" "}
          to see the resulting transaction.
        </p>
      )}
    </PortalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="text-xl font-medium tabular-nums text-ink mt-1">
        {value}
      </div>
    </div>
  );
}
