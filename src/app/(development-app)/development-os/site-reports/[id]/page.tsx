import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getSiteReport } from "@/lib/development/server/site-reports";
import {
  REPORT_STATUS_LABEL,
  WEATHER_LABEL,
  WORKFORCE_ROLE_LABEL,
} from "@/lib/development/constants/site-constants";
import { PhotoGallery } from "@/components/development/site-reports/photo-gallery";
import { PhotoUploadZone } from "@/components/development/site-reports/photo-upload-zone";
import { ConstructionAnalysisCard } from "@/components/development/site-reports/construction-analysis-card";
import { PhotoEvidenceGrid } from "@/components/award";
import { loadSiteReportPhotos } from "@/lib/development/server/site-reports/site-report-photo-queries";
import { getSiteZones } from "@/lib/development/server/site-reports";
import { getActiveAnalysisForReport } from "@/lib/development/server/construction-analysis-actions";
import {
  submitSiteReport,
  reviewSiteReport,
} from "@/lib/development/server/site-report-actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/features/auth/current-user";

export const metadata: Metadata = { title: "Site report · Development OS" };
export const dynamic = "force-dynamic";

export default async function SiteReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Site report" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const report = await getSiteReport(id);
  if (!report) notFound();
  const zones = await getSiteZones(report.projectId);
  const currentUser = await getCurrentAppUser();
  // Stage 3.B — load any active construction analysis for the HITL card.
  const constructionAnalysis = await getActiveAnalysisForReport(report.id).catch(
    () => null,
  );
  // Sprint MD-2.A — Load photo-evidence items for the grid section.
  const evidencePhotos = await loadSiteReportPhotos(report.id).catch(() => []);

  async function handleSubmit() {
    "use server";
    await submitSiteReport(id);
    revalidatePath(`/development-os/site-reports/${id}`);
    redirect(`/development-os/site-reports/${id}`);
  }

  async function handleReview(formData: FormData) {
    "use server";
    const status = String(formData.get("reviewStatus") ?? "reviewed") as
      | "reviewed"
      | "flagged";
    const notes = String(formData.get("reviewerNotes") ?? "");
    if (!currentUser) throw new Error("Not authenticated");
    await reviewSiteReport({
      reportId: id,
      reviewerId: currentUser.id,
      status,
      notes: notes || null,
    });
    revalidatePath(`/development-os/site-reports/${id}`);
    redirect(`/development-os/site-reports/${id}`);
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Site reports", href: "/development-os/site-reports" },
          { label: report.reportDate },
        ]}
        eyebrow={`${report.reportDate} · ${report.projectName ?? "—"}`}
        title="Daily site report"
        description={report.summary ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/site-reports">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All reports
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Snapshot" title="At a glance">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Workers"
            value={`${report.totalWorkersPresent}${report.totalWorkersPlanned ? ` / ${report.totalWorkersPlanned}` : ""}`}
            hint="present / planned"
          />
          <MetricCard
            label="Weather"
            value={
              report.weatherConditions
                ? WEATHER_LABEL[report.weatherConditions]
                : "—"
            }
            hint={
              report.temperatureCelsiusMin && report.temperatureCelsiusMax
                ? `${report.temperatureCelsiusMin}–${report.temperatureCelsiusMax}°C`
                : undefined
            }
          />
          <MetricCard label="Zones reported" value={String(report.zoneCount)} />
          <MetricCard label="Photos" value={String(report.photoCount)} />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-secondary">
          <Badge
            tone={
              report.status === "reviewed"
                ? "success"
                : report.status === "submitted"
                  ? "info"
                  : report.status === "flagged"
                    ? "danger"
                    : "neutral"
            }
          >
            {REPORT_STATUS_LABEL[report.status]}
          </Badge>
          {report.submittedAt && (
            <span>
              Submitted {new Date(report.submittedAt).toLocaleString()}
            </span>
          )}
          {report.reviewedAt && (
            <span>Reviewed {new Date(report.reviewedAt).toLocaleString()}</span>
          )}
        </div>
      </Section>

      <Section eyebrow="Zones" title="Per-zone activity">
        {report.zones.length === 0 ? (
          <EmptyState
            title="No zone activity reported"
            description="The reporter didn't break down by zone for this day."
          />
        ) : (
          <div className="space-y-3">
            {report.zones.map((z) => (
              <div
                key={z.id}
                className={`rounded-lg border ${z.hasBlocker ? "border-warning bg-warning/5" : "border-line-soft bg-surface"} p-4`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono text-xs text-ink-tertiary">
                      {z.zoneCode}
                    </span>
                    <span className="ml-2 font-medium">{z.zoneName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span>{z.workersInZone} workers</span>
                    {z.cumulativeProgressPercent && (
                      <span>· {Number(z.cumulativeProgressPercent).toFixed(1)}% cum.</span>
                    )}
                    {z.hasBlocker && <Badge tone="warning">Blocker</Badge>}
                  </div>
                </div>
                {z.activitiesCompleted.length > 0 && (
                  <div className="text-xs text-ink-secondary">
                    <strong>Completed:</strong> {z.activitiesCompleted.join("; ")}
                  </div>
                )}
                {z.activitiesPlannedTomorrow.length > 0 && (
                  <div className="text-xs text-ink-secondary">
                    <strong>Tomorrow:</strong>{" "}
                    {z.activitiesPlannedTomorrow.join("; ")}
                  </div>
                )}
                {z.blockerDescription && (
                  <div className="mt-2 text-xs text-warning">
                    {z.blockerDescription}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        eyebrow="AI"
        title="Construction supervisor analysis"
        description="Drafts a structured supervisor-style analysis from this report. HITL: every analysis lands as a draft for your review."
      >
        <ConstructionAnalysisCard
          reportId={report.id}
          reportStatus={report.status}
          analysis={
            constructionAnalysis
              ? {
                  id: constructionAnalysis.id,
                  status: constructionAnalysis.status as
                    | "draft"
                    | "approved"
                    | "edited_approved",
                  draftSummary: constructionAnalysis.draftSummary,
                  safetyStatus: constructionAnalysis.safetyStatus as
                    | "normal"
                    | "minor_concerns"
                    | "serious_concerns",
                  safetyConcerns: constructionAnalysis.safetyConcerns,
                  immediateActionsRecommended:
                    constructionAnalysis.immediateActionsRecommended,
                  recommendedReviewerActions:
                    constructionAnalysis.recommendedReviewerActions,
                  workforceFlags: constructionAnalysis.workforceFlags,
                  vendorFlags: constructionAnalysis.vendorFlags,
                  delayRiskFlags: constructionAnalysis.delayRiskFlags,
                  estimatedCompletionPercent:
                    constructionAnalysis.estimatedCompletionPercent,
                  onTrackVsBudget: constructionAnalysis.onTrackVsBudget,
                  reviewedAt: constructionAnalysis.reviewedAt,
                  generatedAt: constructionAnalysis.generatedAt,
                }
              : null
          }
        />
      </Section>

      {report.status === "draft" && (
        <Section eyebrow="Lifecycle" title="Submit for review">
          <p className="text-sm text-ink-secondary mb-3">
            Once submitted, the reviewer (PM or director) can mark this
            report reviewed or flagged. Photos can still be added until
            the report is reviewed.
          </p>
          <form action={handleSubmit}>
            <Button type="submit">Submit report</Button>
          </form>
        </Section>
      )}

      {report.status === "submitted" && (
        <Section eyebrow="Lifecycle" title="Review">
          <form action={handleReview} className="flex flex-col gap-3 max-w-2xl">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Reviewer notes (optional)
              </span>
              <textarea
                name="reviewerNotes"
                rows={2}
                className="rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                name="reviewStatus"
                value="reviewed"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
              >
                Mark reviewed
              </button>
              <button
                type="submit"
                name="reviewStatus"
                value="flagged"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700"
              >
                Flag for follow-up
              </button>
            </div>
          </form>
        </Section>
      )}

      <Section
        eyebrow="Evidence"
        title="Photo evidence"
        description="Quick-scan grid with per-photo sync status. Click a thumbnail to open the full image."
      >
        <PhotoEvidenceGrid
          items={evidencePhotos}
          columns={3}
          emptyMessage="No photos attached to this report yet. Upload below."
        />
      </Section>

      <Section eyebrow="Photos" title="Site photos">
        <PhotoGallery
          photos={report.photos}
          zones={zones.map((z) => ({
            id: z.id,
            zoneCode: z.zoneCode,
            zoneName: z.zoneName,
          }))}
          reportId={report.id}
        />
        {(report.status === "draft" || report.status === "submitted") && (
          <div className="mt-4">
            <h4 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
              Add photos
            </h4>
            <PhotoUploadZone
              reportId={report.id}
              zones={zones.map((z) => ({
                id: z.id,
                projectId: z.projectId,
                zoneCode: z.zoneCode,
                zoneName: z.zoneName,
                zoneType: z.zoneType,
                villaId: z.villaId,
                expectedStartDate: z.expectedStartDate,
                expectedCompletionDate: z.expectedCompletionDate,
                actualStartDate: z.actualStartDate,
                actualCompletionDate: z.actualCompletionDate,
                isActive: z.isActive,
                displayOrder: z.displayOrder,
              }))}
            />
          </div>
        )}
      </Section>

      <Section eyebrow="Workforce" title="Labor breakdown">
        {report.workforce.length === 0 ? (
          <EmptyState
            title="No workforce log"
            description="Add per-role worker counts via the addWorkforceLog action."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Role</TH>
                <TH>Workers</TH>
                <TH>Hours each</TH>
                <TH>Man-hours</TH>
                <TH>Est. cost (USD)</TH>
              </TR>
            </THead>
            <TBody>
              {report.workforce.map((w) => (
                <TR key={w.id}>
                  <TD className="text-sm">{WORKFORCE_ROLE_LABEL[w.roleCategory]}</TD>
                  <TDNum>{w.workerCount}</TDNum>
                  <TDNum>{w.hoursPerWorker}</TDNum>
                  <TDNum>{w.totalManHours ?? "—"}</TDNum>
                  <TDNum>
                    {w.estimatedCostUsdMinor
                      ? `$${(Number(w.estimatedCostUsdMinor) / 100).toLocaleString("en-US")}`
                      : "—"}
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
