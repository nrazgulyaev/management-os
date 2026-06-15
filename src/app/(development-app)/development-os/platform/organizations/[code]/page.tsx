import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Platform</span> /{" "}
            <Link href="/development-os/platform/organizations">
              Organizations
            </Link>{" "}
            / <span>{org.organizationCode}</span>
          </div>
          <h1>{org.name}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {org.organizationType} · {org.subscriptionTier} tier ·{" "}
            {org.countryCode}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/platform/organizations"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All organizations
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Profile</div>
        <Card padding="default">
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
              <HandoffBadge tone={org.isActive ? "ok" : "soft"}>
                {org.isActive ? "active" : "archived"}
              </HandoffBadge>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Settings</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Toggle which platform modules this organization sees in its
          navigation. Archive is irreversible from this UI.
        </p>
        <Card padding="default">
          <OrganizationSettingsForm
            organizationCode={org.organizationCode}
            enabledModules={enabled}
            isActive={org.isActive}
          />
        </Card>
      </div>
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
