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
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </Link>

        <div>
          <h2 className="font-display text-2xl tracking-wide text-stone-900 mb-1">
            My requests
          </h2>
          <p className="text-sm text-stone-600">
            Withdrawal, reinvest, transfer requests you've submitted. Each
            requires Arconique team review and explicit execution.
          </p>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-md border border-stone-300 bg-white p-6 text-sm text-stone-600">
            No requests yet. Submit one from the Wallet tab.
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-stone-300 bg-white p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-medium text-stone-900">
                    <span className="font-mono">{r.requestCode}</span> ·{" "}
                    {r.requestType.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    ${(Number(r.requestedAmountMinor) / 100).toLocaleString()}{" "}
                    {r.currency} · submitted{" "}
                    {new Date(r.submittedAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs uppercase tracking-wide text-stone-700">
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
