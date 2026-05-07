import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { ConnectMarketingForm } from "@/components/marketing/connect-marketing-form";

export const metadata: Metadata = {
  title: "Connect provider · Marketing",
};
export const dynamic = "force-dynamic";

export default async function NewMarketingConnectionPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Connect provider" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  // Stage 7.E tenant subdomain isn't wired into the dashboard layout
  // yet (see Stage 7.E closure note). Until it is, fall back to the
  // canonical Arconique org.
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    return (
      <DevelopmentShell>
        <PageHeader title="Connect provider" />
        <EmptyState
          title="No active organization"
          description="The default organization is missing. Contact support."
        />
      </DevelopmentShell>
    );
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing", href: "/development-os/marketing/dashboard" },
          {
            label: "Connections",
            href: "/development-os/marketing/connections",
          },
          { label: "New" },
        ]}
        title="Connect a marketing provider"
        description="Pick a provider, fill in the credential fields it requires. We test the connection immediately on save and surface the result."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/connections">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All connections
            </Link>
          </Button>
        }
      />

      <Section title="Provider + credentials">
        <ConnectMarketingForm organizationId={org.id} />
      </Section>
    </DevelopmentShell>
  );
}
