import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { getDb } from "@/lib/db/client";
import { investorPortalRequests } from "@/lib/db/schema/investor-portal-requests";

export const metadata: Metadata = {
  title: "My requests · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalRequestsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const db = getDb();
  const requests = db
    ? await db
        .select()
        .from(investorPortalRequests)
        .where(eq(investorPortalRequests.investorId, session.investorId))
        .orderBy(desc(investorPortalRequests.submittedAt))
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
            My requests
          </h2>
          <p className="text-sm text-ink-secondary">
            Withdrawal, reinvest, transfer requests you've submitted. Each
            requires Arconique team review and explicit execution.
          </p>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink-secondary">
              No requests yet
            </p>
            <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
              Submit a withdrawal, reinvestment, or transfer request from the
              Wallet tab. The Arconique team reviews every request before
              execution.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-line-soft bg-surface p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-medium text-ink">
                    <span className="font-mono">{r.requestCode}</span> ·{" "}
                    {r.requestType.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    ${(Number(r.requestedAmountMinor) / 100).toLocaleString()}{" "}
                    {r.currency} · submitted{" "}
                    {new Date(r.submittedAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs uppercase tracking-wide text-ink-secondary">
                  {r.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalShell>
  );
}
