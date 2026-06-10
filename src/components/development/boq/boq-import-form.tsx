"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
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
    <form onSubmit={submit} className="flex flex-col gap-3 max-w-3xl">
      <div className="card p-4 text-xs text-ink-3">
        <p className="font-medium text-ink mb-1">CSV format</p>
        <p className="leading-relaxed">
          Header row required. Section rows have <code>section_code</code> +{" "}
          <code>section_name</code> only (other columns blank). Item rows have
          everything except <code>section_name</code>. Sections are auto-created
          if referenced by an item without a prior section row.
        </p>
        <button
          type="button"
          onClick={() => setCsv(SAMPLE_CSV)}
          className="mt-2 text-amber hover:underline"
        >
          Load sample CSV →
        </button>
      </div>

      <div className="field">
        <span className="field-label">CSV body</span>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={14}
          placeholder="Paste CSV here…"
          className="textarea mono text-xs"
        />
      </div>

      <div className="card p-4 text-xs text-ink-3 flex gap-2 border-warning/40 bg-warning-weak/40">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" strokeWidth={1.75} />
        <span className="leading-relaxed">
          Importing will <strong>replace</strong> all existing sections + items
          on this BOQ document. The operation is atomic — if the CSV fails to
          parse, the existing data is preserved.
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
          Import CSV
        </button>
        {error && <p className="field-error">{error}</p>}
        {result && <p className="text-xs text-ok">{result}</p>}
      </div>
    </form>
  );
}
