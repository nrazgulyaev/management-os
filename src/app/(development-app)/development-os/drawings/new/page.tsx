import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { DrawingForm } from "@/components/development/drawings/drawing-form";

export const metadata: Metadata = { title: "New drawing · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewDrawingPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>New drawing</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/drawings">Drawings</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New drawing</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Drawing metadata only. After creation, add revisions to attach files
            (uploaded via the existing documents pipeline).
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/drawings" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Drawings
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <DrawingForm projects={projectRows} />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
