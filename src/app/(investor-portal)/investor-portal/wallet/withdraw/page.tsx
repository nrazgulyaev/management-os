import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { PortalEmpty } from "@/components/investor-portal/portal-primitives";
import { WithdrawRequestForm } from "@/components/investor-portal/withdraw-request-form";
import { getDb } from "@/lib/db/client";
import {
  capitalCommitments,
  investorWallets,
} from "@/lib/db/schema/investor-capital";
import { projects } from "@/lib/db/schema/projects";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Withdraw · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function WithdrawPage() {
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

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Withdraw"
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
            Withdraw cash
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">
            Submit a withdrawal request from one of your commitments. The
            Arconique team reviews and executes — money does not move on submit.
          </p>
        </header>

        {/* Amber available-to-withdraw KPI — total spendable cash. */}
        <div className="bg-gradient-amber-hero max-w-sm rounded-[14px] p-5 text-white shadow-soft-card">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
            Available to withdraw
          </div>
          <div className="tnum mt-2 font-display text-[32px] font-medium leading-none tracking-[-0.02em]">
            {formatUsdMinor(totalCashMinor)}
          </div>
          <div className="mt-2 text-xs text-white/80">
            Total spendable cash across {commitments.length} commitment
            {commitments.length === 1 ? "" : "s"}
          </div>
        </div>

        {fundableCommitments.length === 0 ? (
          <PortalEmpty
            title="No withdrawable cash"
            body="A withdrawal needs spendable cash on a commitment — typically available after a distribution settles. Check back after your next distribution."
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
                <WithdrawRequestForm
                  commitmentId={c.id}
                  sourceProjectId={c.projectId as string}
                  availableMinor={Number(c.cashBalanceMinor)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
