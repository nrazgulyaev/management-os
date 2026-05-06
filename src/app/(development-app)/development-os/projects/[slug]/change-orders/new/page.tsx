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
        <PageHeader title="New change order" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          {
            label: "Change orders",
            href: `/development-os/projects/${slug}/change-orders`,
          },
          { label: "New" },
        ]}
        title="New change order"
        description="Cost + schedule impacts can be negative for downgrades. Approval routes via approval_thresholds matrix."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/change-orders`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Change orders
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Change order details">
        <ChangeOrderForm
          projectId={project.realProjectId}
          projectSlug={slug}
        />
      </Section>
    </DevelopmentShell>
  );
}
