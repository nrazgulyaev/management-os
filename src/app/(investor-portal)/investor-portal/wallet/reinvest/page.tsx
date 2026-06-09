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
          projectId: capitalCommitments.projectId,
          walletId: investorWallets.id,
          cashBalanceMinor: investorWallets.cashBalanceMinor,
        })
        .from(capitalCommitments)
        .innerJoin(
          investorWallets,
          eq(investorWallets.commitmentId, capitalCommitments.id),
        )
        .where(eq(capitalCommitments.investorId, session.investorId))
    : [];

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

        {commitments.length === 0 || allProjects.length === 0 ? (
          <div className="rounded-md border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
            No commitments or projects available.
          </div>
        ) : (
          <div className="space-y-4">
            {commitments.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-line-soft bg-surface p-5 space-y-3"
              >
                <div className="text-xs text-ink-tertiary">
                  Source: commitment {c.id.slice(0, 8)} · cash $
                  {(Number(c.cashBalanceMinor) / 100).toLocaleString()}
                </div>
                {Number(c.cashBalanceMinor) > 0 && c.projectId ? (
                  <ReinvestRequestForm
                    investorId={session.investorId}
                    sourceProjectId={c.projectId}
                    availableMinor={Number(c.cashBalanceMinor)}
                    targetProjects={allProjects}
                  />
                ) : (
                  <p className="text-xs text-ink-tertiary">
                    No cash currently available on this commitment.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
