"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createSiteReport } from "@/lib/development/server/site-report-actions";

/**
 * Stage 6.P0.6 — Record Site Report modal (Tier 4).
 *
 * Scope: header fields + summary only. Zone/workforce arrays default
 * empty — the existing /site-reports/new full-page form remains the
 * canonical multi-zone entry point. The modal covers the bookkeeper /
 * supervisor's quick-record case (one project, one summary).
 *
 * Workflow verb: "Record site report".
 */

const SOURCE_CHANNELS = [
  { value: "web", label: "Web (this dashboard)" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
  { value: "manual", label: "Manual entry (other)" },
] as const;

export interface ProjectOption {
  id: string;
  name: string;
}

export function SiteReportModalForm({ projects }: { projects: ProjectOption[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const projectId = String(formData.get("projectId") ?? "");
    const reportDate = String(formData.get("reportDate") ?? "");
    const weatherConditions = String(formData.get("weatherConditions") ?? "").trim();
    const totalWorkersPresentRaw = String(formData.get("totalWorkersPresent") ?? "0");
    const totalWorkersPlannedRaw = String(formData.get("totalWorkersPlanned") ?? "");
    const summary = String(formData.get("summary") ?? "").trim();
    const reporterRole = String(formData.get("reporterRole") ?? "").trim();
    const sourceChannel = String(formData.get("sourceChannel") ?? "web");
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        await createSiteReport({
          projectId,
          reportDate,
          weatherConditions: weatherConditions || null,
          totalWorkersPresent: Number(totalWorkersPresentRaw) || 0,
          totalWorkersPlanned: totalWorkersPlannedRaw
            ? Number(totalWorkersPlannedRaw)
            : null,
          summary: summary || null,
          reporterRole: reporterRole || null,
          sourceChannel: sourceChannel as never,
          notes: notes || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record site report");
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="site-report-record-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Record site report
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Record site report"
        description="Quick record. For multi-zone reports with workforce breakdown, use the full form."
        size="md"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Project" required>
              <select name="projectId" required className={selectCls} defaultValue="">
                <option value="" disabled>Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Report date" required>
              <input
                name="reportDate"
                type="date"
                required
                defaultValue={today}
                className={inputCls}
              />
            </Field>
            <Field label="Weather conditions" hint="e.g. clear, light rain">
              <input name="weatherConditions" className={inputCls} />
            </Field>
            <Field label="Reporter role" hint="Site supervisor, foreman, etc.">
              <input name="reporterRole" className={inputCls} />
            </Field>
            <Field label="Workers present" required>
              <input
                name="totalWorkersPresent"
                type="number"
                inputMode="numeric"
                min={0}
                required
                defaultValue={0}
                className={inputCls}
              />
            </Field>
            <Field label="Workers planned" hint="For attendance rate calc">
              <input
                name="totalWorkersPlanned"
                type="number"
                inputMode="numeric"
                min={0}
                className={inputCls}
              />
            </Field>
            <Field label="Source channel" required>
              <select name="sourceChannel" required defaultValue="web" className={selectCls}>
                {SOURCE_CHANNELS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Summary" hint="Headline of the day's progress">
            <textarea name="summary" rows={3} className={textareaCls} />
          </Field>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={textareaCls} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Recording…">
              Record site report
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
