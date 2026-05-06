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
import {
  getBoqDocumentByCode,
} from "@/lib/development/server/boq/boq-queries";
import { exportBoqAsCsv } from "@/lib/development/server/boq/boq-actions";
import { BoqExportClient } from "@/components/development/boq/boq-export-client";

export const metadata: Metadata = { title: "Export BOQ · Development OS" };
export const dynamic = "force-dynamic";

export default async function BoqExportPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Export BOQ" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getBoqDocumentByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { document } = data;
  const csv = await exportBoqAsCsv({ boqDocumentId: document.id });

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
          { label: "Export" },
        ]}
        title={`Export CSV → ${document.boqCode}`}
        description="CSV preview below. Click 'Download' to save the file (UTF-8). Opens directly in Excel / Sheets / Numbers."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/boq/${encodeURIComponent(document.boqCode)}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              BOQ
            </Link>
          </Button>
        }
      />
      <Section eyebrow="CSV" title="Preview + download">
        <BoqExportClient csv={csv} filename={`${document.boqCode}.csv`} />
      </Section>
    </DevelopmentShell>
  );
}
