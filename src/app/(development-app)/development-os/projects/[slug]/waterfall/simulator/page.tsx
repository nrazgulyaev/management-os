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
import { WaterfallSimulator } from "@/components/development/waterfall/waterfall-simulator";

export const metadata: Metadata = {
  title: "Waterfall simulator · Development OS",
};
export const dynamic = "force-dynamic";

export default async function WaterfallSimulatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Waterfall simulator" />
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
          { label: "Projects", href: "/development-os/projects" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          {
            label: "Waterfall",
            href: `/development-os/projects/${slug}/waterfall`,
          },
          { label: "Simulator" },
        ]}
        eyebrow="HITL preview"
        title="Waterfall simulator"
        description="Try any rule + scenario; see the live allocation + reasoning markdown. Math runs entirely in the browser via the same pure helper used by the real distribution path — guaranteed identical output."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/waterfall`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Rules
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Scenario" title="Inputs + allocation">
        <WaterfallSimulator />
      </Section>
    </DevelopmentShell>
  );
}
