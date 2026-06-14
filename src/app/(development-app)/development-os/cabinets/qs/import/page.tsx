import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { ImportBoqPageClient } from "./_import-client";

/**
 * Phase 2.2 dev-03 — BOQ import wizard route.
 *
 * The wizard renders inside `ImportBoqModal`. Visiting this URL
 * opens the modal immediately; closing the modal returns to the
 * QS cabinet. Picking a project is in scope for the data PR.
 */

export const metadata: Metadata = { title: "Import BOQ · Development OS" };
export const dynamic = "force-dynamic";

export default function ImportBoqPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/cabinets/qs">QS · Cost analyst</Link> /{" "}
            <span>Import BOQ</span>
          </div>
          <h1>Import BOQ</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Upload a CSV or XLSX from the QS estimator. Step 2 maps columns;
            step 3 shows the diff vs the current revision before publishing.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/cabinets/qs"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            QS cabinet
          </Link>
        </div>
      </div>
      <ImportBoqPageClient projectLabel="Pick project after upload" />
    </DevelopmentShell>
  );
}
