import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { vendorEngagements } from "@/lib/db/schema/site-operations";
import { getSiteZones } from "@/lib/development/server/site-reports";
import { createSiteReport } from "@/lib/development/server/site-report-actions";
import {
  WEATHER_CONDITIONS,
  WEATHER_LABEL,
  WORKFORCE_ROLES,
  WORKFORCE_ROLE_LABEL,
} from "@/lib/development/constants/site-constants";

export const metadata: Metadata = {
  title: "New site report · Development OS",
};
export const dynamic = "force-dynamic";

interface SearchParams {
  projectId?: string;
  reportDate?: string;
  error?: string;
}

/**
 * Site report create — single comprehensive form (not multi-step
 * wizard). Operator selects project + date + weather + per-zone
 * activities + workforce in one screen, then either saves draft or
 * submits.
 *
 * Multi-step wizard with progressive save was deferred from the
 * 2.4.B spec — the underlying server action `createSiteReport` is
 * already atomic (parent + zones + workforce in one tx), so the
 * single-form create is functionally equivalent for the daily-entry
 * use case. Photos are added on the detail page after the report
 * exists.
 *
 * Mobile: a `viewport`-aware single-column layout falls out from the
 * grid below `md:` breakpoint. Touch-friendly inputs (native HTML5
 * date/select).
 */
export default async function NewSiteReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/site-reports">Site reports</Link> /{" "}
              <span>New</span>
            </div>
            <h1>New site report</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  // Projects with at least one active engagement (or any project if none).
  const projectList = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .orderBy(projects.name);

  const selectedProjectId = sp.projectId ?? projectList[0]?.id;
  const zones = selectedProjectId
    ? await getSiteZones(selectedProjectId)
    : [];

  // Active engagements on the selected project — populates the workforce
  // vendor-engagement dropdown.
  const engagementList = selectedProjectId
    ? await db
        .select({
          id: vendorEngagements.id,
          code: vendorEngagements.engagementCode,
          scope: vendorEngagements.scopeDescription,
        })
        .from(vendorEngagements)
        .where(eq(vendorEngagements.projectId, selectedProjectId))
        .orderBy(vendorEngagements.engagementCode)
    : [];

  const today = new Date().toISOString().slice(0, 10);
  const reportDate = sp.reportDate ?? today;

  async function handleSubmit(formData: FormData) {
    "use server";
    const projectId = String(formData.get("projectId") ?? "");
    const reportDate = String(formData.get("reportDate") ?? today);
    const weather = String(formData.get("weather") ?? "");
    const weatherNotes = String(formData.get("weatherNotes") ?? "");
    const totalPresent = Number(formData.get("totalWorkersPresent") ?? 0);
    const totalPlanned = Number(formData.get("totalWorkersPlanned") ?? 0);
    const summary = String(formData.get("summary") ?? "");
    const reporterRole = String(formData.get("reporterRole") ?? "");
    const tempMin = formData.get("tempMin")
      ? Number(formData.get("tempMin"))
      : null;
    const tempMax = formData.get("tempMax")
      ? Number(formData.get("tempMax"))
      : null;

    // Per-zone fields — keys like `zone-{id}-cumulative`, `zone-{id}-completed`,
    // `zone-{id}-blocker-toggle`, `zone-{id}-blocker-desc`, `zone-{id}-workers`.
    type ZoneInput = {
      zoneId: string;
      activitiesCompleted: string[];
      activitiesPlannedTomorrow: string[];
      workersInZone: number;
      cumulativeProgressPercent: number | null;
      hasBlocker: boolean;
      blockerDescription: string | null;
    };
    const zoneInputs: ZoneInput[] = [];
    for (const zone of zones) {
      const completed = String(formData.get(`zone-${zone.id}-completed`) ?? "");
      const tomorrow = String(formData.get(`zone-${zone.id}-tomorrow`) ?? "");
      const workers = Number(formData.get(`zone-${zone.id}-workers`) ?? 0);
      const cumPct = formData.get(`zone-${zone.id}-cumulative`)
        ? Number(formData.get(`zone-${zone.id}-cumulative`))
        : null;
      const hasBlocker = formData.get(`zone-${zone.id}-blocker-toggle`) === "on";
      const blockerDesc = String(formData.get(`zone-${zone.id}-blocker-desc`) ?? "");
      // Skip zones operator didn't fill anything for.
      if (
        !completed &&
        !tomorrow &&
        workers === 0 &&
        cumPct == null &&
        !hasBlocker
      ) {
        continue;
      }
      zoneInputs.push({
        zoneId: zone.id,
        activitiesCompleted: completed
          ? completed.split("\n").map((l) => l.trim()).filter(Boolean)
          : [],
        activitiesPlannedTomorrow: tomorrow
          ? tomorrow.split("\n").map((l) => l.trim()).filter(Boolean)
          : [],
        workersInZone: workers,
        cumulativeProgressPercent: cumPct ?? null,
        hasBlocker,
        blockerDescription: hasBlocker ? blockerDesc : null,
      });
    }

    // Workforce rows — keys like `wf-{i}-role`, `wf-{i}-count`, etc.
    type WorkforceInput = {
      roleCategory:
        | "foreman"
        | "skilled_worker"
        | "unskilled_worker"
        | "specialist"
        | "equipment_operator"
        | "helper";
      workerCount: number;
      hoursPerWorker: number;
      vendorEngagementId: string | null;
    };
    const workforceInputs: WorkforceInput[] = [];
    for (let i = 0; i < 6; i++) {
      const role = String(formData.get(`wf-${i}-role`) ?? "");
      const count = Number(formData.get(`wf-${i}-count`) ?? 0);
      if (!role || count === 0) continue;
      const hours = Number(formData.get(`wf-${i}-hours`) ?? 8);
      const engagement = String(formData.get(`wf-${i}-engagement`) ?? "");
      workforceInputs.push({
        roleCategory: role as WorkforceInput["roleCategory"],
        workerCount: count,
        hoursPerWorker: hours,
        vendorEngagementId: engagement || null,
      });
    }

    try {
      const result = await createSiteReport({
        projectId,
        reportDate,
        weatherConditions: weather || null,
        weatherNotes: weatherNotes || null,
        temperatureCelsiusMin: tempMin,
        temperatureCelsiusMax: tempMax,
        totalWorkersPresent: totalPresent,
        totalWorkersPlanned: totalPlanned || null,
        summary: summary || null,
        reporterRole: reporterRole || null,
        sourceChannel: "web",
        zones: zoneInputs,
        workforce: workforceInputs,
      });
      redirect(`/development-os/site-reports/${result.id}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/development-os/site-reports/new?projectId=${projectId}&reportDate=${reportDate}&error=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/site-reports">Site reports</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New site report</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            One report per project per day. Save the report (defaults to draft)
            and add photos on the detail page; submit when ready for review.
          </p>
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

      {sp.error && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {sp.error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-6">
        <div>
          <div className="label mb-2.5">Step 1 · Basics</div>
          <Card padding="default">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Project">
              <select
                name="projectId"
                defaultValue={selectedProjectId ?? ""}
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                name="reportDate"
                defaultValue={reportDate}
                required
                max={today}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Weather">
              <select
                name="weather"
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {WEATHER_CONDITIONS.map((w) => (
                  <option key={w} value={w}>
                    {WEATHER_LABEL[w]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reporter role">
              <input
                type="text"
                name="reporterRole"
                placeholder="site_manager / foreman / etc"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Workers present">
              <input
                type="number"
                name="totalWorkersPresent"
                min="0"
                defaultValue="0"
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Workers planned">
              <input
                type="number"
                name="totalWorkersPlanned"
                min="0"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Temp min (°C)">
              <input
                type="number"
                name="tempMin"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Temp max (°C)">
              <input
                type="number"
                name="tempMax"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Weather notes" full>
              <input
                type="text"
                name="weatherNotes"
                placeholder="Optional"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
          </Card>
        </div>

        <div>
          <div className="label mb-2.5">Step 2 · Workforce by role</div>
          <Card padding="default">
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end"
              >
                <Field label={i === 0 ? "Role" : ""}>
                  <select
                    name={`wf-${i}-role`}
                    defaultValue=""
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {WORKFORCE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {WORKFORCE_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={i === 0 ? "Workers" : ""}>
                  <input
                    type="number"
                    name={`wf-${i}-count`}
                    min="0"
                    defaultValue="0"
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label={i === 0 ? "Hours each" : ""}>
                  <input
                    type="number"
                    step="0.5"
                    name={`wf-${i}-hours`}
                    min="0"
                    defaultValue="8"
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label={i === 0 ? "Engagement (optional)" : ""}>
                  <select
                    name={`wf-${i}-engagement`}
                    defaultValue=""
                    className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {engagementList.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.code}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-tertiary mt-2">
            Up to 5 role rows. Empty rows are skipped.
          </p>
          </Card>
        </div>

        <div>
          <div className="label mb-2.5">Step 3 · Zones</div>
          <Card padding="default">
          {zones.length === 0 ? (
            <div className="space-y-3">
              <EmptyState
                title="No zones for this project"
                description="Define the project's structure / finishing / MEP / etc breakdown before capturing per-zone activity. You can still save a report-level summary without zones."
              />
              <Button asChild variant="secondary">
                <Link
                  href={`/development-os/site-reports/zones${selectedProjectId ? `?projectId=${selectedProjectId}` : ""}`}
                >
                  Create zone
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {zones.map((z) => (
                <div
                  key={z.id}
                  className="rounded-lg border border-line-soft bg-surface p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono text-xs text-ink-tertiary">
                        {z.zoneCode}
                      </span>
                      <span className="ml-2 font-medium">{z.zoneName}</span>
                    </div>
                    <HandoffBadge tone="soft">{z.zoneType}</HandoffBadge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Activities completed (one per line)">
                      <textarea
                        name={`zone-${z.id}-completed`}
                        rows={3}
                        className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <Field label="Planned tomorrow (one per line)">
                      <textarea
                        name={`zone-${z.id}-tomorrow`}
                        rows={3}
                        className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <Field label="Workers in zone">
                      <input
                        type="number"
                        name={`zone-${z.id}-workers`}
                        min="0"
                        defaultValue="0"
                        className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <Field label="Cumulative progress %">
                      <input
                        type="number"
                        step="0.5"
                        name={`zone-${z.id}-cumulative`}
                        min="0"
                        max="100"
                        className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-sm md:col-span-2">
                      <input
                        type="checkbox"
                        name={`zone-${z.id}-blocker-toggle`}
                      />
                      Has blocker
                    </label>
                    <Field label="Blocker description (if any)" full>
                      <input
                        type="text"
                        name={`zone-${z.id}-blocker-desc`}
                        className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-sm"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
          </Card>
        </div>

        <div>
          <div className="label mb-2.5">Step 4 · Summary</div>
          <Card padding="default">
          <Field label="Daily summary (free text)" full>
            <textarea
              name="summary"
              rows={4}
              placeholder="Operator's narrative for the day. AI translation pipeline (Stage 3) auto-translates this for non-English speakers."
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
            />
          </Field>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-tertiary">
            Saves as draft. Photos can be added on the detail page after
            saving. Submit for review via the detail page.
          </p>
          <button type="submit" className="btn btn-accent">
            Save draft
          </button>
        </div>
      </form>
    </DevelopmentShell>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      {label && (
        <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}
