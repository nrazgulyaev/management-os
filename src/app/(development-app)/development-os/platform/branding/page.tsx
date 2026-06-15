import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listOrganizations } from "@/lib/development/server/organizations/organization-queries";
import { renderBrandingCss } from "@/lib/development/server/organizations/branding-helpers";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Branding · Platform" };
export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const orgs = await safeQuery(
    "platform-branding.listOrganizations",
    listOrganizations(),
    [] as Awaited<ReturnType<typeof listOrganizations>>,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Platform</span> / <span>Branding</span>
          </div>
          <h1>White-label branding</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-organization logo, favicon, primary/accent colors. Hex inputs
            are validated server-side to defend against CSS injection.
          </p>
        </div>
      </div>

      {orgs.length === 0 ? (
        <div>
          <Card padding="default">
            <EmptyState
              title="No organizations"
              description="Seed at least ARCONIQUE_DEFAULT."
            />
          </Card>
        </div>
      ) : (
        orgs.map((o) => {
          const cfg =
            (o.brandingConfig as Record<string, unknown> | null) ?? {};
          const css = renderBrandingCss(cfg);
          return (
            <div key={o.id}>
              <div className="label mb-2.5">
                {o.organizationCode} · {o.name}
              </div>
              <Card padding="default">
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
              </Card>
            </div>
          );
        })
      )}
    </DevelopmentShell>
  );
}
