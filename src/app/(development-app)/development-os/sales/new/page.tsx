import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { leadSources } from "@/lib/db/schema/contacts";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser, AuthorizationError } from "@/features/auth/permissions";
import { CaptureLeadForm, type Option } from "./_capture-lead-form";

export const metadata: Metadata = { title: "Capture new lead · Development OS" };
export const dynamic = "force-dynamic";

/**
 * Create-lead surface for the sales-manager cabinet "Capture new lead" CTA.
 * Previously /development-os/sales/new was swallowed by the [contactRoleId]
 * route into a notFound(). A static `new` segment wins over the dynamic one,
 * so the CTA now lands on this org-scoped capture form (backed by the
 * `createLead` action). Option dropdowns are filtered to the caller's org.
 */
export default async function NewLeadPage() {
  // Same auth gate as the createLead write path — internal users only.
  // Degrade to a Forbidden state instead of throwing a 500 when a
  // non-internal/no-session context reaches this page (the layout
  // normally redirects logged-out users, but a logged-in non-internal
  // user must not crash the route).
  try {
    await requireInternalUser();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <DevelopmentShell>
          <Section eyebrow="Sales" title="Capture new lead">
            <EmptyState
              title="Internal access required"
              description="Lead capture is available to internal Development OS users. Sign in with an internal account to continue."
              action={
                <Button asChild variant="secondary">
                  <Link href="/development-os/sales">Back to pipeline</Link>
                </Button>
              }
            />
          </Section>
        </DevelopmentShell>
      );
    }
    throw err;
  }
  const db = getDb();

  let projectOptions: Option[] = [];
  let sourceOptions: Option[] = [];

  if (db) {
    const organizationId = await requireOrgId();
    const [projectRows, sourceRows] = await Promise.all([
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.organizationId, organizationId))
        .orderBy(projects.name),
      db
        .select({
          id: leadSources.id,
          sourceCode: leadSources.sourceCode,
          campaignName: leadSources.campaignName,
        })
        .from(leadSources)
        .where(
          and(
            eq(leadSources.organizationId, organizationId),
            eq(leadSources.isActive, true),
          ),
        )
        .orderBy(leadSources.sourceCode),
    ]);
    projectOptions = projectRows;
    sourceOptions = sourceRows.map((s) => ({
      id: s.id,
      name: s.campaignName ?? s.sourceCode,
    }));
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Sales & buyers", href: "/development-os/sales" },
          { label: "Capture lead" },
        ]}
        title="Capture new lead"
        description="Manual lead entry. The form looks up the contact by email or phone — if a contact already exists, the new lead role attaches to it instead of creating a duplicate."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/sales">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Pipeline
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Lead details">
        {db ? (
          <CaptureLeadForm projects={projectOptions} leadSources={sourceOptions} />
        ) : (
          <EmptyState
            title="Lead capture runs against the database"
            description="Database connection not configured. Contact support."
            action={<Badge tone="warning">DATABASE_URL not set</Badge>}
          />
        )}
      </Section>
    </DevelopmentShell>
  );
}
