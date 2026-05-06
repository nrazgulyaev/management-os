import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { siteZones } from "@/lib/db/schema/site-operations";
import { recordSafetyIncident } from "@/lib/development/server/safety-actions";
import {
  SAFETY_CATEGORIES,
  SAFETY_CATEGORY_LABEL,
  SAFETY_SEVERITIES,
  SAFETY_SEVERITY_LABEL,
} from "@/lib/development/constants/safety-constants";

export const metadata: Metadata = {
  title: "Record incident · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * Safety incident creation form. Designed for **fast emergency entry**:
 *
 *   - Date/time defaults to NOW (no clicks required)
 *   - Severity selectable via large color-coded buttons (radio inputs
 *     styled as buttons — works on touch without JS)
 *   - When severity is severe/fatal, a banner warns that senior
 *     management notification will fire on submit
 *   - Description is the largest field, encouraging detail
 *
 * Photos are added on the detail page after creation, same pattern as
 * site reports — keeps the create form fast.
 */
export default async function NewSafetyIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Record safety incident" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);

  const selectedProjectId = sp.projectId ?? projectList[0]?.id;
  const zones = selectedProjectId
    ? await db
        .select({
          id: siteZones.id,
          code: siteZones.zoneCode,
          name: siteZones.zoneName,
        })
        .from(siteZones)
        .where(eqProjectFilter(selectedProjectId))
        .orderBy(siteZones.displayOrder)
    : [];

  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);
  const nowTime = now.toISOString().slice(11, 16);

  async function handleSubmit(formData: FormData) {
    "use server";
    const projectId = String(formData.get("projectId") ?? "");
    const zoneId = String(formData.get("zoneId") ?? "") || null;
    const incidentDate = String(formData.get("incidentDate") ?? todayDate);
    const incidentTime = String(formData.get("incidentTime") ?? "") || null;
    const severity = String(formData.get("severity") ?? "minor") as
      | (typeof SAFETY_SEVERITIES)[number];
    const category = String(formData.get("category") ?? "other") as
      | (typeof SAFETY_CATEGORIES)[number];
    const affected = Number(formData.get("affectedWorkersCount") ?? 0);
    const description = String(formData.get("description") ?? "");
    const immediateActions =
      String(formData.get("immediateActionsTaken") ?? "") || null;
    const reportedToAuthorities =
      formData.get("reportedToAuthorities") === "on";
    const authorityRef = String(formData.get("authorityReportReference") ?? "") || null;

    // Generate incident_code: INC-YYYY-NNNNNN with seq via a one-shot
    // count + 1 (the action's UNIQUE constraint catches concurrent races).
    const year = new Date(incidentDate).getFullYear();
    const code = `INC-${year}-${String(Math.floor(Math.random() * 100000)).padStart(6, "0")}`;

    try {
      await recordSafetyIncident({
        incidentCode: code,
        projectId,
        zoneId,
        incidentDate,
        incidentTime,
        severity,
        category,
        affectedWorkersCount: affected,
        description,
        immediateActionsTaken: immediateActions,
        reportedToAuthorities,
        authorityReportReference: authorityRef,
      });
      redirect(`/development-os/safety`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(`/development-os/safety/new?error=${encodeURIComponent(msg)}`);
    }
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Safety", href: "/development-os/safety" },
          { label: "New incident" },
        ]}
        title="Record safety incident"
        description="Fast emergency entry. Photos and authority follow-up are added on the incident detail page after recording."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/safety">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Safety log
            </Link>
          </Button>
        }
      />

      {sp.error && (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {sp.error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4 max-w-3xl">
        <Section eyebrow="Severity" title="How serious">
          <fieldset className="flex flex-wrap gap-2">
            {SAFETY_SEVERITIES.map((s) => (
              <label
                key={s}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm
                  ${
                    s === "fatal"
                      ? "border-danger has-[:checked]:bg-danger has-[:checked]:text-white"
                      : s === "severe"
                        ? "border-danger has-[:checked]:bg-danger has-[:checked]:text-white"
                        : s === "moderate"
                          ? "border-warning has-[:checked]:bg-warning has-[:checked]:text-white"
                          : s === "minor"
                            ? "border-info has-[:checked]:bg-info has-[:checked]:text-white"
                            : "border-line-soft has-[:checked]:bg-stone-700 has-[:checked]:text-white"
                  }`}
              >
                <input
                  type="radio"
                  name="severity"
                  value={s}
                  defaultChecked={s === "minor"}
                  className="sr-only"
                />
                {SAFETY_SEVERITY_LABEL[s]}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-ink-tertiary mt-2">
            Severe or fatal incidents fire an immediate notification to senior
            management and trigger the safety-escalation cron loop.
          </p>
        </Section>

        <Section eyebrow="Where + when" title="Project + location + time">
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
            <Field label="Zone (optional)">
              <select
                name="zoneId"
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code} · {z.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                name="incidentDate"
                defaultValue={todayDate}
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                name="incidentTime"
                defaultValue={nowTime}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Category">
              <select
                name="category"
                defaultValue="other"
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                {SAFETY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {SAFETY_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Affected workers">
              <input
                type="number"
                name="affectedWorkersCount"
                min="0"
                defaultValue="0"
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </Section>

        <Section eyebrow="What happened" title="Description + immediate response">
          <Field label="Description (what happened, witnesses, conditions)" full>
            <textarea
              name="description"
              required
              minLength={5}
              rows={5}
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Immediate actions taken" full>
            <textarea
              name="immediateActionsTaken"
              rows={3}
              placeholder="First aid? Area secured? Workers stood down?"
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="reportedToAuthorities" />
              Reported to authorities
            </label>
            <Field label="Authority reference (if any)">
              <input
                type="text"
                name="authorityReportReference"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
          </div>
        </Section>

        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Severe / fatal incidents</strong> trigger an immediate
            notification to senior management on save and start the
            safety-escalation cron loop (24h cooldown until resolved).
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit">Record incident</Button>
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
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

// Wrapped to keep the imports clean.
import { eq } from "drizzle-orm";
function eqProjectFilter(projectId: string) {
  return eq(siteZones.projectId, projectId);
}
