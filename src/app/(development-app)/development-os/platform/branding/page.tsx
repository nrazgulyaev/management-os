import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listOrganizations } from "@/lib/development/server/organizations/organization-queries";
import { renderBrandingCss } from "@/lib/development/server/organizations/branding-helpers";

export const metadata: Metadata = { title: "Branding · Platform" };
export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const orgs = await listOrganizations();

  return (
    <DevelopmentShell>
      <PageHeader
        title="White-label branding"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Platform" },
          { label: "Branding" },
        ]}
        description="Per-organization logo, favicon, primary/accent colors. Hex inputs are validated server-side to defend against CSS injection."
      />

      {orgs.length === 0 ? (
        <Section>
          <EmptyState title="No organizations" description="Seed at least ARCONIQUE_DEFAULT." />
        </Section>
      ) : (
        orgs.map((o) => {
          const cfg =
            (o.brandingConfig as Record<string, unknown> | null) ?? {};
          const css = renderBrandingCss(cfg);
          return (
            <Section
              key={o.id}
              title={o.name}
              eyebrow={o.organizationCode}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-ink-tertiary mb-1">
                    Branding config
                  </h4>
                  <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto">
                    {JSON.stringify(cfg, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-ink-tertiary mb-1">
                    Generated CSS
                  </h4>
                  <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto">
                    {css || "/* no overrides */"}
                  </pre>
                </div>
              </div>
            </Section>
          );
        })
      )}
    </DevelopmentShell>
  );
}
