import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { ReinvestRequestForm } from "@/components/investor-portal/reinvest-request-form";
import { getDb } from "@/lib/db/client";
import {
  capitalCommitments,
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

  const allProjects = db
    ? await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
    : [];

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div className="space-y-6">
        <Link
          href="/investor-portal/dashboard"
          className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </Link>

        <div>
          <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
            Reinvest
          </h2>
          <p className="text-sm text-ink-secondary">
            Move cash from one of your existing commitments into another
            Arconique project. Operator review + execution required.
          </p>
        </div>

        {fundableCommitments.length === 0 || allProjects.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink-secondary">
              No reinvestable cash
            </p>
            <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
              Reinvest unlocks once one of your commitments has spendable cash —
              typically after a distribution settles. Check back after your next
              distribution.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {fundableCommitments.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-line-soft bg-surface p-5 space-y-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm text-ink">
                    <span className="font-mono text-ink-secondary">
                      {c.code}
                    </span>
                    {c.projectName ? (
                      <span className="text-ink-tertiary"> · {c.projectName}</span>
                    ) : null}
                  </div>
                  <div className="text-sm font-medium tabular-nums text-ink">
                    {formatUsdMinor(c.cashBalanceMinor)}{" "}
                    <span className="text-xs font-normal text-ink-tertiary">
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
