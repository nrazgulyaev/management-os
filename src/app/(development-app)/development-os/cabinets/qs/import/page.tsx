import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "QS · Cost analyst", href: "/development-os/cabinets/qs" },
          { label: "Import BOQ" },
        ]}
        eyebrow="3-step wizard · upload → map → reconcile"
        title="Import BOQ"
        description="Upload a CSV or XLSX from the QS estimator. Step 2 maps columns; step 3 shows the diff vs the current revision before publishing."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cabinets/qs">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              QS cabinet
            </Link>
          </Button>
        }
      />
      <ImportBoqPageClient projectLabel="Pick project after upload" />
    </DevelopmentShell>
  );
}
