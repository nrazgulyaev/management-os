import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { BoqForm } from "@/components/development/boq/boq-form";

export const metadata: Metadata = { title: "New BOQ · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewBoqPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Construction · estimate</div>
            <h1>New BOQ</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects);

  if (projectRows.length === 0) {
    // 8.A.6 — without at least one project the form's hidden projectId
    // ends up empty and createBoqDocument's Zod schema rejects with a
    // generic 500. Surface a clear empty state with a CTA instead.
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os/boq">BOQ</Link>
              <span>/</span>
              <span>New</span>
            </div>
            <h1>New BOQ document</h1>
          </div>
        </header>
        <EmptyState
          title="No projects yet"
          description="Create a project before drafting a BOQ — every BOQ document is scoped to one project."
          action={
            <Link href="/development-os/projects" className="btn btn-accent">
              Create a project
            </Link>
          }
        />
      </DevelopmentShell>
    );
  }

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/boq">BOQ</Link>
            <span>/</span>
            <span>New</span>
          </div>
          <h1>New BOQ document</h1>
        </div>
        <div className="actions">
          <Link href="/development-os/boq" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            BOQ
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        Create the BOQ shell. Sections + items can be added afterwards via the
        API or via CSV import.
      </p>

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          Form
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
          Document details
        </h2>
      </div>
      <BoqForm projects={projectRows} />
    </DevelopmentShell>
  );
}
