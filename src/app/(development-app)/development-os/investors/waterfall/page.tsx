import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getFundPositions } from "@/lib/development/server/investor-fund-positions";
import {
  FundWaterfallPanel,
  type FundForClient,
} from "@/components/development/investors/fund-waterfall-panel";

export const metadata: Metadata = {
  title: "Waterfall & capital calls · Development OS",
};
export const dynamic = "force-dynamic";

export default async function InvestorWaterfallPage() {
  const db = getDb();
  const funds = db ? await getFundPositions() : [];

  const fundsForClient: FundForClient[] = funds.map((f) => ({
    projectId: f.projectId,
    projectName: f.projectName,
    projectSlug: f.projectSlug,
    totalCommittedUsdMinor: f.totalCommittedUsdMinor,
    totalContributedUsdMinor: f.totalContributedUsdMinor,
    lpCount: f.lpCount,
    lps: f.lps.map((l) => ({
      commitmentId: l.commitmentId,
      investorId: l.investorId,
      investorCode: l.investorCode,
      investorLegalName: l.investorLegalName,
      committedUsdMinor: l.committedUsdMinor,
      contributedUsdMinor: l.contributedUsdMinor,
      pctOfFund: l.pctOfFund,
    })),
  }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/investors">Investors</Link> /{" "}
            <span>Waterfall & calls</span>
          </div>
          <h1>Waterfall & capital calls</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Model a European distribution waterfall over a fund&apos;s LP
            commitments, and issue pro-rata capital calls. Distribution math is
            a what-if preview; capital-call issuance writes the call and its
            per-LP allocations.
          </p>
          <div className="label mt-2">
            {db
              ? `${fundsForClient.length} fund${fundsForClient.length === 1 ? "" : "s"} with active commitments`
              : "Database not configured"}
          </div>
        </div>
        <div className="actions">
          <Link href="/development-os/investors" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All investors
          </Link>
        </div>
      </div>

      {!db ? (
        <EmptyState
          title="Waterfall needs the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      ) : fundsForClient.length === 0 ? (
        <EmptyState
          title="No funds with active commitments"
          description="Add a commitment to a project to model distributions and issue capital calls against its LPs."
          action={
            <Link href="/development-os/investors" className="btn btn-secondary">
              Go to investors
            </Link>
          }
        />
      ) : (
        <FundWaterfallPanel funds={fundsForClient} />
      )}
    </DevelopmentShell>
  );
}
