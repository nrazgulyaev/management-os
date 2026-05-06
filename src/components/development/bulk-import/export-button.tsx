"use client";

import { useState, useTransition } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportEntityData } from "@/lib/development/server/bulk-import/export-actions";

/**
 * Stage 6.P0.7-C.3 — Reusable Export button.
 *
 * Drops onto any list page; calls the per-entity export action and
 * triggers a client-side download via Blob + anchor. Three formats:
 * CSV / XLSX / JSON.
 *
 * Pattern (call site):
 *
 *   <ExportButton entity="transactions" />
 *
 * The action is per-entity; filter forwarding is on the roadmap
 * (currently exports the unfiltered list).
 */

type ExportFormat = "csv" | "xlsx" | "json";

const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "json", label: "JSON" },
];

export function ExportButton({
  entity,
  label = "Export",
}: {
  entity:
    | "transactions"
    | "invoices"
    | "vendors"
    | "leads"
    | "reservations"
    | "buyers"
    | "investors"
    | "site_reports"
    | "materials"
    | "tasks"
    | "qa_qc_issues"
    | "inventory_items";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function triggerDownload(filename: string, mimeType: string, base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleSelect(format: ExportFormat) {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      try {
        const result = await exportEntityData({ entity, format });
        if (!result.ok || !result.base64 || !result.filename || !result.mimeType) {
          setError(result.error ?? "Export failed");
          return;
        }
        triggerDownload(result.filename, result.mimeType, result.base64);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed");
      }
    });
  }

  return (
    <div className="relative inline-block">
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        data-testid={`export-button-${entity}`}
      >
        <Download className="w-4 h-4" strokeWidth={1.75} />
        {pending ? "Exporting…" : label}
        <ChevronDown className="w-3 h-3" strokeWidth={1.75} />
      </Button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-10 min-w-[160px] rounded-md border border-line-soft bg-canvas shadow-lg"
          role="menu"
          data-testid={`export-menu-${entity}`}
        >
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => handleSelect(f.value)}
              className="block w-full text-left px-4 py-2 text-sm text-ink hover:bg-muted min-h-[44px]"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div className="absolute right-0 mt-1 z-10 min-w-[200px] rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {error}
        </div>
      )}
    </div>
  );
}
