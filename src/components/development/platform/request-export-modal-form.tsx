"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { requestDataExport } from "@/lib/development/server/data-export/data-export-actions";

/**
 * Settings · Data export — enqueue a GDPR snapshot request.
 *
 * Wraps the existing `requestDataExport` server action, which derives
 * organizationId + requestedBy server-side (NEVER trusts a client org —
 * the cron faithfully dumps the requesting org's full dataset). The
 * background dev_os_data_export_processor cron picks up the `pending`
 * row and produces the download. After enqueue we router.refresh() so
 * the new request appears in the table.
 */

const SCOPES = [
  { value: "full_organization", label: "Full organization" },
  { value: "projects_only", label: "Projects only" },
  { value: "financials_only", label: "Financials only" },
  { value: "users_only", label: "Users only" },
  { value: "ai_logs_only", label: "AI logs only" },
] as const;

const FORMATS = [
  { value: "json", label: "JSON" },
  { value: "csv", label: "CSV" },
  { value: "sql", label: "SQL" },
] as const;

export function RequestExportModalForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    const exportScope = String(formData.get("exportScope") ?? "full_organization");
    const exportFormat = String(formData.get("exportFormat") ?? "json");
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      try {
        const result = await requestDataExport({
          exportScope:
            exportScope as "full_organization" | "projects_only" | "financials_only" | "users_only" | "ai_logs_only" | "custom_subset",
          exportFormat: exportFormat as "json" | "csv" | "sql",
          notes: notes || undefined,
        });
        if (!result.ok) {
          setError(result.error ?? "Failed to request export");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to request export");
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="export-request-trigger"
      >
        <Download className="w-4 h-4" strokeWidth={1.75} />
        Request export
      </Button>
      <EntityModal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Request data export"
        description="Enqueue a per-organization snapshot. The background processor generates the output and keeps it downloadable for 7 days."
        size="md"
      >
        <form
          action={handleSubmit}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Scope" required hint="What to include in the snapshot">
              <select
                name="exportScope"
                defaultValue="full_organization"
                className={selectCls}
              >
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Format" required>
              <select
                name="exportFormat"
                defaultValue="json"
                className={selectCls}
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes" hint="Optional — reason / ticket reference">
            <textarea
              name="notes"
              rows={2}
              className={textareaCls}
              placeholder="e.g. Annual GDPR data-portability request"
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Enqueuing…">
              Request export
            </SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
