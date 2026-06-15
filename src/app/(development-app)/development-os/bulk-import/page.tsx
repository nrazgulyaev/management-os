import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { BulkImportWizard } from "@/components/development/bulk-import/wizard";

export const metadata: Metadata = { title: "Bulk import · Development OS" };
export const dynamic = "force-dynamic";

export default function BulkImportPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Bulk import</span>
          </div>
          <h1>Bulk import</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Upload a CSV, XLSX, or JSON file → map its columns to internal
            fields → preview validation → commit. Background processor handles
            batching for large files.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/bulk-import/jobs"
            className="btn btn-secondary btn-sm"
          >
            <History className="w-4 h-4" strokeWidth={1.75} />
            Past imports
          </Link>
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>
      <BulkImportWizard />
    </DevelopmentShell>
  );
}
