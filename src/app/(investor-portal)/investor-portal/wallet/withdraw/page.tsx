import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { WithdrawRequestForm } from "@/components/investor-portal/withdraw-request-form";
import { getDb } from "@/lib/db/client";
import {
  capitalCommitments,
  investorWallets,
} from "@/lib/db/schema/investor-capital";

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

  const totalCash = commitments.reduce(
    (acc, c) => acc + Number(c.cashBalanceMinor),
    0,
  );

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div className="space-y-6">
        <Link
          href="/investor-portal/dashboard"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </Link>

        <div>
          <h2 className="font-display text-2xl tracking-wide text-stone-900 mb-1">
            Withdraw cash
          </h2>
          <p className="text-sm text-stone-600">
            Submit a withdrawal request from one of your commitments. The
            Arconique team reviews and executes — money does not move on submit.
          </p>
        </div>

        {commitments.length === 0 ? (
          <div className="rounded-md border border-stone-300 bg-white p-6 text-sm text-stone-600">
            No commitments with cash available.
          </div>
        ) : (
          <div className="space-y-4">
            {commitments.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-stone-300 bg-white p-5 space-y-3"
              >
                <div className="text-xs text-stone-500">
                  Commitment {c.id.slice(0, 8)} · cash $
                  {(Number(c.cashBalanceMinor) / 100).toLocaleString()}
                </div>
                {Number(c.cashBalanceMinor) > 0 && c.projectId ? (
                  <WithdrawRequestForm
                    investorId={session.investorId}
                    commitmentId={c.id}
                    sourceProjectId={c.projectId}
                    availableMinor={Number(c.cashBalanceMinor)}
                  />
                ) : (
                  <p className="text-xs text-stone-500">
                    No cash currently available on this commitment.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-stone-500">
          Total available across commitments: $
          {(totalCash / 100).toLocaleString()}
        </p>
      </div>
    </PortalShell>
  );
}
