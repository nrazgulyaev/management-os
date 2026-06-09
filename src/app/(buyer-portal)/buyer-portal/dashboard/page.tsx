import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building, FileText } from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { eq } from "drizzle-orm";
import { buyerUnitAssignments, buyerProgressReports } from "@/lib/db/schema/buyers";

export const metadata: Metadata = { title: "Dashboard · Buyer Portal" };
export const dynamic = "force-dynamic";

export default async function BuyerDashboard() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  const assignments = await db
    .select()
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, buyer.buyerId));

  const reports = await db
    .select({
      id: buyerProgressReports.id,
      projectId: buyerProgressReports.projectId,
      reportingPeriodEnd: buyerProgressReports.reportingPeriodEnd,
      currentProgressPercentage:
        buyerProgressReports.currentProgressPercentage,
      nextMilestone: buyerProgressReports.nextMilestone,
      publishedAt: buyerProgressReports.publishedAt,
    })
    .from(buyerProgressReports)
    .where(eq(buyerProgressReports.status, "published"))
    .limit(5);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          Welcome back, {buyer.displayName.split(" ")[0]}
        </h2>
        <p className="text-sm text-ink-secondary">
          Track construction progress on your villa(s) and review payment
          milestones.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/buyer-portal/units"
          className="rounded-lg border border-line-soft bg-surface p-5 hover:shadow-sm transition"
        >
          <Building
            className="w-5 h-5 text-ink-secondary mb-2"
            strokeWidth={1.5}
          />
          <div className="text-2xl font-display text-ink">
            {assignments.length}
          </div>
          <div className="text-sm text-ink-secondary">
            {assignments.length === 1 ? "Villa" : "Villas"} assigned to you
          </div>
        </Link>
        <Link
          href="/buyer-portal/reports"
          className="rounded-lg border border-line-soft bg-surface p-5 hover:shadow-sm transition"
        >
          <FileText
            className="w-5 h-5 text-ink-secondary mb-2"
            strokeWidth={1.5}
          />
          <div className="text-2xl font-display text-ink">
            {reports.length}
          </div>
          <div className="text-sm text-ink-secondary">
            Recent published progress {reports.length === 1 ? "report" : "reports"}
          </div>
        </Link>
      </section>

      {reports.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-ink-secondary mb-3">
            Latest progress
          </h3>
          <ul className="space-y-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-line-soft bg-surface p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm text-ink">
                    {r.nextMilestone ?? "Construction update"}
                  </div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    Period ending {r.reportingPeriodEnd}
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
                  Read
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </BuyerShell>
  );
}
