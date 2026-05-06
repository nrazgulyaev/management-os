import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { OrganizationSettingsForm } from "@/components/development/platform/organization-settings-form";

export const metadata: Metadata = { title: "Organization · Platform" };
export const dynamic = "force-dynamic";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const org = await getOrganizationByCode(decodeURIComponent(code));
  if (!org) notFound();

  const enabled = Array.isArray(org.enabledModules)
    ? (org.enabledModules as string[])
    : [];

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Platform" },
          {
            label: "Organizations",
            href: "/development-os/platform/organizations",
          },
          { label: org.organizationCode },
        ]}
        eyebrow={org.organizationCode}
        title={org.name}
        description={`${org.organizationType} · ${org.subscriptionTier} tier · ${org.countryCode}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/platform/organizations">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All organizations
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Profile" title="Identity">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Field label="Code" value={org.organizationCode} mono />
          <Field label="Type" value={org.organizationType} />
          <Field label="Tier" value={org.subscriptionTier} />
          <Field label="Country" value={org.countryCode} />
          <Field label="Currency" value={org.primaryCurrency} />
          <Field label="Language" value={org.primaryLanguage} />
          <Field label="Timezone" value={org.timezone} />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Status
            </div>
            <Badge tone={org.isActive ? "success" : "neutral"}>
              {org.isActive ? "active" : "archived"}
            </Badge>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Settings"
        title="Modules + lifecycle"
        description="Toggle which platform modules this organization sees in its navigation. Archive is irreversible from this UI."
      >
        <OrganizationSettingsForm
          organizationCode={org.organizationCode}
          enabledModules={enabled}
          isActive={org.isActive}
        />
      </Section>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={mono ? "font-mono text-xs" : "text-sm"}>{value}</div>
    </div>
  );
}
