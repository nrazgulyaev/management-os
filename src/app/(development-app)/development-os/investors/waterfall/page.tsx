import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Investors", href: "/development-os/investors" },
          { label: "Waterfall & calls" },
        ]}
        eyebrow={
          db
            ? `${fundsForClient.length} fund${fundsForClient.length === 1 ? "" : "s"} with active commitments`
            : "Database not configured"
        }
        title="Waterfall & capital calls"
        description="Model a European distribution waterfall over a fund's LP commitments, and issue pro-rata capital calls. Distribution math is a what-if preview; capital-call issuance writes the call and its per-LP allocations."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/investors">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All investors
            </Link>
          </Button>
        }
      />

      {!db ? (
        <EmptyState
          title="Waterfall needs the database"
          description="Database connection not configured. Contact support."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      ) : fundsForClient.length === 0 ? (
        <EmptyState
          title="No funds with active commitments"
          description="Add a commitment to a project to model distributions and issue capital calls against its LPs."
          action={
            <Button asChild variant="secondary">
              <Link href="/development-os/investors">Go to investors</Link>
            </Button>
          }
        />
      ) : (
        <FundWaterfallPanel funds={fundsForClient} />
      )}
    </DevelopmentShell>
  );
}
