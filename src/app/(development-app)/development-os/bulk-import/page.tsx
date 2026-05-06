import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { BulkImportWizard } from "@/components/development/bulk-import/wizard";

export const metadata: Metadata = { title: "Bulk import · Development OS" };
export const dynamic = "force-dynamic";

export default function BulkImportPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Bulk import" },
        ]}
        title="Bulk import"
        description="Upload a CSV, XLSX, or JSON file → map its columns to internal fields → preview validation → commit. Background processor handles batching for large files."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/bulk-import/jobs">
                <History className="w-4 h-4" strokeWidth={1.75} />
                Past imports
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />
      <BulkImportWizard />
    </DevelopmentShell>
  );
}
