import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import { getBuyerProgressReport } from "@/lib/buyer-portal/reports";

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
  const buyer = session;

  // No RLS — only return the report if it belongs to a project the buyer owns
  // a unit in (and is published); guessed/foreign ids 404.
  const report = await getBuyerProgressReport(buyer.buyerId, id);
  if (!report) notFound();

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <Link
        href="/buyer-portal/reports"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        All reports
      </Link>

      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          {report.nextMilestone ?? "Construction update"}
        </h2>
        <p className="text-sm text-ink-secondary">
          Period {report.reportingPeriodStart} → {report.reportingPeriodEnd}
          {report.currentProgressPercentage != null && (
            <>
              {" · "}
              <span className="font-medium text-ink">
                {Number(report.currentProgressPercentage).toFixed(0)}% complete
              </span>
            </>
          )}
        </p>
      </section>

      {report.worksCompletedSummary && (
        <section className="rounded-lg border border-line-soft bg-surface p-5">
          <h3 className="text-sm font-medium text-ink-secondary mb-2">
            Completed this period
          </h3>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
            {report.worksCompletedSummary}
          </p>
        </section>
      )}

      {report.worksPlannedSummary && (
        <section className="rounded-lg border border-line-soft bg-surface p-5">
          <h3 className="text-sm font-medium text-ink-secondary mb-2">
            Planned next
          </h3>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
            {report.worksPlannedSummary}
          </p>
        </section>
      )}

      {report.expectedHandoverDate && (
        <section className="rounded-lg border border-line-soft bg-surface p-5">
          <h3 className="text-sm font-medium text-ink-secondary mb-1">
            Expected handover
          </h3>
          <p className="text-sm text-ink">{report.expectedHandoverDate}</p>
        </section>
      )}

      {report.highlightedRisks && (
        <section className="rounded-lg border border-warning bg-warning-weak p-5">
          <h3 className="text-sm font-medium text-ink mb-2">
            Highlighted risks
          </h3>
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
            {report.highlightedRisks}
          </p>
        </section>
      )}

      {report.managementCommentary && (
        <section className="rounded-lg border border-line-soft bg-surface p-5">
          <h3 className="text-sm font-medium text-ink-secondary mb-2">
            From the management team
          </h3>
          <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed italic">
            {report.managementCommentary}
          </p>
        </section>
      )}

      <p className="text-[11px] text-ink-tertiary text-center pt-4">
        Published{" "}
        {report.publishedAt
          ? new Date(report.publishedAt).toLocaleDateString()
          : "—"}
      </p>
    </BuyerShell>
  );
}
