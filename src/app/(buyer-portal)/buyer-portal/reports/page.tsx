import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { listBuyerProgressReports } from "@/lib/buyer-portal/reports";

export const metadata: Metadata = { title: "Progress reports · Buyer Portal" };
export const dynamic = "force-dynamic";

export default async function BuyerReportsPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const buyer = session;

  // No RLS on the connection — scope explicitly to the buyer's own projects.
  const reports = await listBuyerProgressReports(buyer.buyerId);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          Progress reports
        </h2>
        <p className="text-sm text-ink-secondary">
          Curated construction updates for the projects where you own a villa.
        </p>
      </section>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
          No published reports yet. Check back after the next site visit.
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-line-soft bg-surface p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">
                    {r.nextMilestone ?? "Construction update"}
                  </div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    Period {r.reportingPeriodStart} → {r.reportingPeriodEnd}
                    {r.currentProgressPercentage != null && (
                      <>
                        {" · "}
                        {Number(r.currentProgressPercentage).toFixed(0)}% complete
                      </>
                    )}
                  </div>
                </div>
                <Link
                  href={`/buyer-portal/reports/${r.id}`}
                  className="text-sm text-ink-secondary underline hover:text-ink transition-colors"
                >
                  Read full report
                </Link>
              </div>
              {r.worksCompletedSummary && (
                <p className="text-sm text-ink-secondary mt-3 leading-relaxed line-clamp-3">
                  {r.worksCompletedSummary}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </BuyerShell>
  );
}
