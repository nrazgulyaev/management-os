import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import { PurchaseRequestMobileForm } from "@/components/development/procurement/purchase-request-mobile-form";

export const metadata: Metadata = {
  title: "New purchase request · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewPurchaseRequestPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="New purchase request" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projects = await safeQuery(
    "getDevelopmentProjects",
    getDevelopmentProjects(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          {
            label: "Purchase requests",
            href: "/development-os/procurement/purchase-requests",
          },
          { label: "New" },
        ]}
        title="New purchase request"
        description="Mobile-friendly form for site supervisors. Touch targets ≥ 44px, single-column layout below 768px. Voice-to-text on the reason field uses your browser's native dictation if available."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/procurement/purchase-requests">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All requests
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Form" title="What's needed">
        <PurchaseRequestMobileForm
          projects={projects
            .filter((p) => p.realProjectId)
            .map((p) => ({
              id: p.realProjectId!,
              name: p.name,
              slug: p.slug,
            }))}
        />
      </Section>
    </DevelopmentShell>
  );
}
