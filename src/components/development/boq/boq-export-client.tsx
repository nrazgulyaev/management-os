"use client";

import { Download } from "lucide-react";

/**
 * Client-side download trigger. Uses Blob + URL.createObjectURL to save
 * the CSV without a server-side route.
 */
export function BoqExportClient({
  csv,
  filename,
}: {
  csv: string;
  filename: string;
}) {
  function download() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={download} className="btn btn-accent self-start">
        <Download className="w-4 h-4" strokeWidth={1.75} />
        Download {filename}
      </button>
      <pre className="card text-[11px] font-mono whitespace-pre-wrap text-ink-2 p-4 max-h-[400px] overflow-y-auto">
        {csv}
      </pre>
    </div>
  );
}
