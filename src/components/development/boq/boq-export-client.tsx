"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-3">
      <Button onClick={download}>
        <Download className="w-4 h-4 mr-2" strokeWidth={1.75} />
        Download {filename}
      </Button>
      <pre className="text-[11px] font-mono whitespace-pre-wrap rounded border border-line-soft bg-muted/30 p-3 max-h-[400px] overflow-y-auto">
        {csv}
      </pre>
    </div>
  );
}
