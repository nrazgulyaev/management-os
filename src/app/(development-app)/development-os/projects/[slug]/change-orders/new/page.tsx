import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { ChangeOrderForm } from "@/components/development/change-orders/change-order-form";

export const metadata: Metadata = {
  title: "New change order · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewChangeOrderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>New change order</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link>{" "}
            /{" "}
            <Link href={`/development-os/projects/${slug}/change-orders`}>
              Change orders
            </Link>{" "}
            / <span>New</span>
          </div>
          <h1>New change order</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Cost + schedule impacts can be negative for downgrades. Approval
            routes via approval_thresholds matrix.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/change-orders`}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Change orders
          </Link>
        </div>
      </div>
      <div className="mt-[18px]">
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <ChangeOrderForm
            projectId={project.realProjectId}
            projectSlug={slug}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
