"use client";

import * as React from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * WAVE-D ai-agents polish — Copy / Download-JSON affordances for raw
 * agent-output JSON blocks (detailedOutput / affectedEntities).
 *
 * Client island: the detail component (`agent-output-detail.tsx`) is a
 * server component, so the clipboard + Blob-download wiring lives here
 * and is mounted alongside each `<pre>` dump. We stringify on the
 * client from the already-rendered value (passed as a serialisable
 * prop) — no extra server roundtrip, no new action.
 */
export function JsonExportButtons({
  value,
  filename,
}: {
  value: unknown;
  filename: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const json = React.useMemo(
    () => JSON.stringify(value, null, 2),
    [value],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — no-op;
      // the Download button remains a working fallback.
    }
  }

  function handleDownload() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="w-4 h-4" strokeWidth={1.75} />
        ) : (
          <Copy className="w-4 h-4" strokeWidth={1.75} />
        )}
        {copied ? "Copied" : "Copy JSON"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleDownload}
      >
        <Download className="w-4 h-4" strokeWidth={1.75} />
        Download JSON
      </Button>
    </div>
  );
}
