import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listQaQcCategories } from "@/lib/development/server/qa-qc/qa-qc-queries";
import { projects, villas } from "@/lib/db/schema/projects";
import { QaQcCreateForm } from "@/components/development/qa-qc/qa-qc-create-form";

export const metadata: Metadata = { title: "New QA/QC issue · Development OS" };
export const dynamic = "force-dynamic";

export default async function QaQcCreatePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New QA/QC issue" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [projectRows, villaRows, categories] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects),
    db
      .select({
        id: villas.id,
        unitCode: villas.unitCode,
        projectId: villas.projectId,
      })
      .from(villas),
    listQaQcCategories(),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "QA/QC", href: "/development-os/qa-qc" },
          { label: "New issue" },
        ]}
        title="Log a new QA/QC issue"
        description="Mobile-friendly form for site staff. 44px+ touch targets, single-column on phones."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/qa-qc">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Inbox
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Form" title="Defect details">
        <QaQcCreateForm
          projects={projectRows}
          villas={villaRows}
          categories={categories.map((c) => ({
            id: c.id,
            displayName: c.displayName,
          }))}
        />
      </Section>
    </DevelopmentShell>
  );
}
