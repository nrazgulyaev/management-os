import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New content · Marketing" };
export const dynamic = "force-dynamic";

export default function NewContentPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        title="New content piece"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Content", href: "/development-os/marketing/content" },
          { label: "New" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/content">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Create content">
        <p className="text-sm text-ink-secondary leading-relaxed">
          New content pieces start in <code>draft</code>. Use the AI Marketing
          Assistant agent to generate captions and hashtags, then flow the
          piece through the pipeline:
          <code> draft → in_production → pending_review → approved → scheduled → published</code>.
        </p>
      </Section>
    </DevelopmentShell>
  );
}
