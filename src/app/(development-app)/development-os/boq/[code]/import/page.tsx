import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getBoqDocumentByCode } from "@/lib/development/server/boq/boq-queries";
import { BoqImportForm } from "@/components/development/boq/boq-import-form";

export const metadata: Metadata = { title: "Import BOQ · Development OS" };
export const dynamic = "force-dynamic";

export default async function BoqImportPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Construction · estimate</div>
            <h1>Import BOQ</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getBoqDocumentByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { document } = data;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/boq">BOQ</Link>
            <span>/</span>
            <Link
              href={`/development-os/boq/${encodeURIComponent(document.boqCode)}`}
            >
              {document.boqCode}
            </Link>
            <span>·</span>
            <span>Import</span>
          </div>
          <h1>Import CSV → {document.boqCode}</h1>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/boq/${encodeURIComponent(document.boqCode)}`}
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            BOQ
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        Bulk-load sections + items from a CSV body. CSV format chosen over XLSX
        to keep zero new dependencies — round-trips cleanly through
        Excel/Sheets/Numbers.
      </p>

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          CSV
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
          Paste body
        </h2>
      </div>
      <BoqImportForm boqDocumentId={document.id} boqCode={document.boqCode} />
    </DevelopmentShell>
  );
}
