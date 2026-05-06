import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { buyerProgressReports } from "@/lib/db/schema/buyers";

export const metadata: Metadata = {
  title: "Progress report · Buyer Portal",
};
export const dynamic = "force-dynamic";

export default async function BuyerReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  // RLS guards: buyer sees only published reports for their projects/units.
  const [report] = await db
    .select()
    .from(buyerProgressReports)
    .where(eq(buyerProgressReports.id, id))
    .limit(1);
  if (!report || report.status !== "published") notFound();

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <Link
        href="/buyer-portal/reports"
        className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        All reports
      </Link>

      <section>
        <h2 className="font-display text-2xl tracking-wide text-stone-900 mb-1">
          {report.nextMilestone ?? "Construction update"}
        </h2>
        <p className="text-sm text-stone-600">
          Period {report.reportingPeriodStart} → {report.reportingPeriodEnd}
          {report.currentProgressPercentage != null && (
            <>
              {" · "}
              <span className="font-medium text-stone-900">
                {Number(report.currentProgressPercentage).toFixed(0)}% complete
              </span>
            </>
          )}
        </p>
      </section>

      {report.worksCompletedSummary && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <h3 className="text-sm font-medium text-stone-700 mb-2">
            Completed this period
          </h3>
          <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
            {report.worksCompletedSummary}
          </p>
        </section>
      )}

      {report.worksPlannedSummary && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <h3 className="text-sm font-medium text-stone-700 mb-2">
            Planned next
          </h3>
          <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
            {report.worksPlannedSummary}
          </p>
        </section>
      )}

      {report.expectedHandoverDate && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <h3 className="text-sm font-medium text-stone-700 mb-1">
            Expected handover
          </h3>
          <p className="text-sm text-stone-900">{report.expectedHandoverDate}</p>
        </section>
      )}

      {report.highlightedRisks && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h3 className="text-sm font-medium text-stone-900 mb-2">
            Highlighted risks
          </h3>
          <p className="text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">
            {report.highlightedRisks}
          </p>
        </section>
      )}

      {report.managementCommentary && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <h3 className="text-sm font-medium text-stone-700 mb-2">
            From the management team
          </h3>
          <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed italic">
            {report.managementCommentary}
          </p>
        </section>
      )}

      <p className="text-[11px] text-stone-500 text-center pt-4">
        Published{" "}
        {report.publishedAt
          ? new Date(report.publishedAt).toLocaleDateString()
          : "—"}
      </p>
    </BuyerShell>
  );
}
