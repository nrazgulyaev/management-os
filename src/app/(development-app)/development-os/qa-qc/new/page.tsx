import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>New QA/QC issue</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/qa-qc">QA/QC</Link> /{" "}
            <span>New issue</span>
          </div>
          <h1>Log a new QA/QC issue</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Mobile-friendly form for site staff. 44px+ touch targets,
            single-column on phones.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/qa-qc" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Inbox
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <QaQcCreateForm
            projects={projectRows}
            villas={villaRows}
            categories={categories.map((c) => ({
              id: c.id,
              displayName: c.displayName,
            }))}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
