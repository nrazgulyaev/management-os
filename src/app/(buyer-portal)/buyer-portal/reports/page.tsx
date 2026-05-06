import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerProgressReports } from "@/lib/db/schema/buyers";

export const metadata: Metadata = { title: "Progress reports · Buyer Portal" };
export const dynamic = "force-dynamic";

export default async function BuyerReportsPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  // RLS scopes the rows: buyer sees only published reports for their units
  // (or project-level reports for projects where they own a unit).
  const reports = await db
    .select()
    .from(buyerProgressReports)
    .where(eq(buyerProgressReports.status, "published"));

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-stone-900 mb-1">
          Progress reports
        </h2>
        <p className="text-sm text-stone-600">
          Curated construction updates for the projects where you own a villa.
        </p>
      </section>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-stone-300 bg-white p-6 text-sm text-stone-600">
          No published reports yet. Check back after the next site visit.
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-stone-300 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-stone-900">
                    {r.nextMilestone ?? "Construction update"}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
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
                  className="text-sm text-stone-700 underline"
                >
                  Read full report
                </Link>
              </div>
              {r.worksCompletedSummary && (
                <p className="text-sm text-stone-700 mt-3 leading-relaxed line-clamp-3">
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
