import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
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
        <PageHeader title="Import BOQ" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getBoqDocumentByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { document } = data;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "BOQ", href: "/development-os/boq" },
          {
            label: document.boqCode,
            href: `/development-os/boq/${encodeURIComponent(document.boqCode)}`,
          },
          { label: "Import" },
        ]}
        title={`Import CSV → ${document.boqCode}`}
        description="Bulk-load sections + items from a CSV body. CSV format chosen over XLSX to keep zero new dependencies — round-trips cleanly through Excel/Sheets/Numbers."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/boq/${encodeURIComponent(document.boqCode)}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              BOQ
            </Link>
          </Button>
        }
      />
      <Section eyebrow="CSV" title="Paste body">
        <BoqImportForm boqDocumentId={document.id} boqCode={document.boqCode} />
      </Section>
    </DevelopmentShell>
  );
}
