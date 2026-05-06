import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New campaign · Marketing" };
export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        title="New campaign"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Campaigns", href: "/development-os/marketing/campaigns" },
          { label: "New" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/campaigns">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Create form">
        <p className="text-sm text-ink-secondary leading-relaxed">
          Wire to the <code>createCampaign</code> server action. Required:
          <code> campaignCode</code>, <code>name</code>,
          <code>campaignObjective</code>, <code>campaignStart</code>,
          <code>campaignEnd</code>.
        </p>
      </Section>
    </DevelopmentShell>
  );
}
