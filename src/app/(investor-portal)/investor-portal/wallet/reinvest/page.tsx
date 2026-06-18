import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { PortalEmpty } from "@/components/investor-portal/portal-primitives";
import { ReinvestRequestForm } from "@/components/investor-portal/reinvest-request-form";
import { getDb } from "@/lib/db/client";
import {
  capitalCommitments,
  investors,
  investorWallets,
} from "@/lib/db/schema/investor-capital";
import { projects } from "@/lib/db/schema/projects";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Reinvest · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function ReinvestPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const db = getDb();
  const commitments = db
    ? await db
        .select({
          id: capitalCommitments.id,
          code: capitalCommitments.commitmentCode,
          projectId: capitalCommitments.projectId,
          projectName: projects.name,
          walletId: investorWallets.id,
          cashBalanceMinor: investorWallets.cashBalanceMinor,
        })
        .from(capitalCommitments)
        .innerJoin(
          investorWallets,
          eq(investorWallets.commitmentId, capitalCommitments.id),
        )
        .leftJoin(projects, eq(projects.id, capitalCommitments.projectId))
        .where(eq(capitalCommitments.investorId, session.investorId))
    : [];

  const fundableCommitments = commitments.filter(
    (c) => c.cashBalanceMinor > 0n && c.projectId,
  );

  const totalCashMinor = commitments.reduce(
    (acc, c) => acc + c.cashBalanceMinor,
    0n,
  );

  // Scope target projects to the authenticated investor's organization
  // (resolved server-side from the session, never a client value). The
  // org is derived by joining projects to the investor's own record, so
  // the picker can never surface another tenant's project names.
  const allProjects = db
    ? await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .innerJoin(
          investors,
          eq(investors.organizationId, projects.organizationId),
        )
        .where(eq(investors.id, session.investorId))
    : [];

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Reinvest"
    >
      <div className="flex flex-col gap-5">
        {/* Page header — back-crumb + mono eyebrow + display title */}
        <header>
          <Link
            href="/investor-portal/dashboard"
            className="mb-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-tertiary transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.75} />
            {strings.navDashboard}
          </Link>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-4">
            Wallet
          </div>
          <h1 className="mt-1.5 font-display text-[29px] font-medium leading-none tracking-[-0.02em] text-ink">
            Reinvest
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">
            Move cash from one of your existing commitments into another
            Arconique project. Operator review + execution required.
          </p>
        </header>

        {/* Amber available-to-reinvest KPI — total spendable cash. */}
        <div className="bg-gradient-amber-hero max-w-sm rounded-[14px] p-5 text-white shadow-soft-card">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
            Available to reinvest
          </div>
          <div className="tnum mt-2 font-display text-[32px] font-medium leading-none tracking-[-0.02em]">
            {formatUsdMinor(totalCashMinor)}
          </div>
          <div className="mt-2 text-xs text-white/80">
            Total spendable cash across {commitments.length} commitment
            {commitments.length === 1 ? "" : "s"}
          </div>
        </div>

        {fundableCommitments.length === 0 || allProjects.length === 0 ? (
          <PortalEmpty
            title="No reinvestable cash"
            body="Reinvest unlocks once one of your commitments has spendable cash — typically after a distribution settles. Check back after your next distribution."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {fundableCommitments.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel p-[22px] shadow-soft-card"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[13.5px] text-ink">
                    <span className="font-mono text-xs text-ink-3">
                      {c.code}
                    </span>
                    {c.projectName ? (
                      <span className="text-ink-3"> · {c.projectName}</span>
                    ) : null}
                  </div>
                  <div className="tnum font-display text-[17px] font-medium text-ink">
                    {formatUsdMinor(c.cashBalanceMinor)}{" "}
                    <span className="font-sans text-xs font-normal text-ink-4">
                      cash
                    </span>
                  </div>
                </div>
                <ReinvestRequestForm
                  sourceProjectId={c.projectId as string}
                  availableMinor={Number(c.cashBalanceMinor)}
                  targetProjects={allProjects}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
