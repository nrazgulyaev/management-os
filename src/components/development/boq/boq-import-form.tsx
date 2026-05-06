"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importBoqFromCsv } from "@/lib/development/server/boq/boq-actions";

const SAMPLE_CSV = `section_code,section_name,item_code,description,quantity,uom,unit_rate_minor,currency
1,Earthworks,,,,,,
1.1,Excavation,,,,,,
1.1,,001,Site clearing & excavation,1500,m²,8500,IDR
1.1,,002,Backfill & compaction,1200,m³,15000,IDR
2,Structure,,,,,,
2.1,Concrete,,,,,,
2.1,,001,C30 concrete columns,42,m³,1850000,IDR
`;

export function BoqImportForm({
  boqDocumentId,
  boqCode,
}: {
  boqDocumentId: string;
  boqCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!csv.trim()) {
      setError("Paste a CSV body");
      return;
    }
    startTransition(async () => {
      try {
        const out = await importBoqFromCsv({ boqDocumentId, csv });
        setResult(
          `Imported ${out.sectionCount} section${out.sectionCount === 1 ? "" : "s"} + ${out.itemCount} item${out.itemCount === 1 ? "" : "s"}.`,
        );
        // Refresh the BOQ detail page after a beat.
        setTimeout(() => {
          router.push(`/development-os/boq/${encodeURIComponent(boqCode)}`);
          router.refresh();
        }, 1500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-3xl">
      <div className="rounded border border-line-soft bg-muted/30 p-3 text-xs text-ink-secondary">
        <p className="font-medium text-ink mb-1">CSV format</p>
        <p>
          Header row required. Section rows have <code>section_code</code> +{" "}
          <code>section_name</code> only (other columns blank). Item rows have
          everything except <code>section_name</code>. Sections are auto-created
          if referenced by an item without a prior section row.
        </p>
        <button
          type="button"
          onClick={() => setCsv(SAMPLE_CSV)}
          className="mt-2 text-info hover:underline"
        >
          Load sample CSV →
        </button>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">CSV body</span>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={14}
          placeholder="Paste CSV here…"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-xs font-mono"
        />
      </label>

      <div className="rounded border border-warning/40 bg-warning/10 p-3 text-xs text-ink-secondary flex gap-2">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <span>
          Importing will <strong>replace</strong> all existing sections + items
          on this BOQ document. The operation is atomic — if the CSV fails to
          parse, the existing data is preserved.
        </span>
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Import CSV
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && <p className="text-xs text-success">{result}</p>}
    </form>
  );
}
