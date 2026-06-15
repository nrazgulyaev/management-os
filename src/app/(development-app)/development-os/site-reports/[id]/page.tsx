import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
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
import { and, eq } from "drizzle-orm";
import {
  materialPoLines,
  materialPurchaseOrders,
} from "@/lib/db/schema/site-operations";
import { requireOrgId } from "@/features/auth/require-org";
import {
  RecordMaterialConsumptionForm,
  type ConsumptionPoLineOption,
} from "./_material-consumption";

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
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/site-reports">Site reports</Link> /{" "}
              <span>Site report</span>
            </div>
            <h1>Site report</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const report = await getSiteReport(id).catch(() => null);
  if (!report) notFound();
  // SESSION-RESOLUTION-1 P3 — defensive guards. Any of these downstream
  // queries failing must not cascade to a page crash; render with safe
  // fallbacks so the operator can still see the report and submit it.
  const zones = await getSiteZones(report.projectId).catch(() => []);
  const currentUser = await getCurrentAppUser().catch(() => null);
  const constructionAnalysis = await getActiveAnalysisForReport(report.id).catch(
    () => null,
  );
  const evidencePhotos = await loadSiteReportPhotos(report.id).catch(() => []);

  // Org-scoped PO lines for this project — powers the material-consumption
  // form. Scope by org (material_po_lines has its own organization_id) AND by
  // the report's project (join to material_purchase_orders). getDb() is
  // guarded above, so db is non-null here.
  const orgId = await requireOrgId();
  const poLineRows = await db
    .select({
      id: materialPoLines.id,
      poCode: materialPurchaseOrders.poCode,
      lineNumber: materialPoLines.lineNumber,
      materialName: materialPoLines.materialName,
      unitOfMeasure: materialPoLines.unitOfMeasure,
      quantityOrdered: materialPoLines.quantityOrdered,
      quantityDelivered: materialPoLines.quantityDelivered,
      quantityConsumed: materialPoLines.quantityConsumed,
    })
    .from(materialPoLines)
    .innerJoin(
      materialPurchaseOrders,
      eq(materialPoLines.poId, materialPurchaseOrders.id),
    )
    .where(
      and(
        eq(materialPoLines.organizationId, orgId),
        eq(materialPurchaseOrders.projectId, report.projectId),
      ),
    )
    .orderBy(materialPurchaseOrders.poCode, materialPoLines.lineNumber)
    .catch(() => []);

  const consumptionPoLines: ConsumptionPoLineOption[] = poLineRows.map((r) => ({
    id: r.id,
    poCode: r.poCode,
    lineNumber: r.lineNumber,
    materialName: r.materialName,
    unitOfMeasure: r.unitOfMeasure,
    quantityOrdered: Number(r.quantityOrdered),
    quantityDelivered: Number(r.quantityDelivered),
    quantityConsumed: Number(r.quantityConsumed),
  }));

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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/site-reports">Site reports</Link> /{" "}
            <span>{report.reportDate}</span>
          </div>
          <h1>Daily site report</h1>
          <div className="label mt-2">
            {report.reportDate} · {report.projectName ?? "—"}
          </div>
          {report.summary && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {report.summary}
            </p>
          )}
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/site-reports">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All reports
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Snapshot</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Workers"
            value={`${report.totalWorkersPresent}${report.totalWorkersPlanned ? ` / ${report.totalWorkersPlanned}` : ""}`}
            sub="present / planned"
          />
          <Kpi
            label="Weather"
            value={
              report.weatherConditions
                ? WEATHER_LABEL[report.weatherConditions]
                : "—"
            }
            sub={
              report.temperatureCelsiusMin && report.temperatureCelsiusMax
                ? `${report.temperatureCelsiusMin}–${report.temperatureCelsiusMax}°C`
                : undefined
            }
          />
          <Kpi label="Zones reported" value={String(report.zoneCount)} />
          <Kpi label="Photos" value={String(report.photoCount)} />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-secondary">
          <HandoffBadge
            tone={
              report.status === "reviewed"
                ? "ok"
                : report.status === "submitted"
                  ? "info"
                  : report.status === "flagged"
                    ? "danger"
                    : "soft"
            }
          >
            {REPORT_STATUS_LABEL[report.status]}
          </HandoffBadge>
          {report.submittedAt && (
            <span>
              Submitted {new Date(report.submittedAt).toLocaleString()}
            </span>
          )}
          {report.reviewedAt && (
            <span>Reviewed {new Date(report.reviewedAt).toLocaleString()}</span>
          )}
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Zones · Per-zone activity</div>
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
                    {z.hasBlocker && <HandoffBadge tone="warn">Blocker</HandoffBadge>}
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
      </div>

      <div>
        <div className="label mb-2.5">Materials · Record consumption</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Log material drawn down per zone against a delivered PO line. Each
          entry bumps the PO line&rsquo;s consumed quantity atomically so the
          procurement utilization always reconciles (feeds the site &rarr;
          material-usage &rarr; finance bridge).
        </p>
        <Card padding="default">
          <RecordMaterialConsumptionForm
            reportId={report.id}
            zones={zones.map((z) => ({
              id: z.id,
              zoneCode: z.zoneCode,
              zoneName: z.zoneName,
            }))}
            poLines={consumptionPoLines}
          />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">AI · Construction supervisor analysis</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Drafts a structured supervisor-style analysis from this report. HITL:
          every analysis lands as a draft for your review.
        </p>
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
      </div>

      {report.status === "draft" && (
        <div>
          <div className="label mb-2.5">Lifecycle · Submit for review</div>
          <Card padding="default">
          <p className="text-sm text-ink-secondary mb-3">
            Once submitted, the reviewer (PM or director) can mark this
            report reviewed or flagged. Photos can still be added until
            the report is reviewed.
          </p>
          <form action={handleSubmit}>
            <button type="submit" className="btn btn-accent">
              Submit report
            </button>
          </form>
          </Card>
        </div>
      )}

      {report.status === "submitted" && (
        <div>
          <div className="label mb-2.5">Lifecycle · Review</div>
          <Card padding="default">
          {!currentUser ? (
            <p className="text-sm text-ink-tertiary">
              Sign in to mark this report reviewed or flagged. The report has
              been submitted and is awaiting review by a project manager.
            </p>
          ) : (
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
          )}
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Evidence · Photo evidence</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Quick-scan grid with per-photo sync status. Click a thumbnail to open
          the full image.
        </p>
        <PhotoEvidenceGrid
          items={evidencePhotos}
          columns={3}
          emptyMessage="No photos attached to this report yet. Upload below."
        />
      </div>

      <div>
        <div className="label mb-2.5">Photos · Site photos</div>
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
      </div>

      <div>
        <div className="label mb-2.5">Workforce · Labor breakdown</div>
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
      </div>
    </DevelopmentShell>
  );
}
