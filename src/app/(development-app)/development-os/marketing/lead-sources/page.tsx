import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listLeadSources } from "@/lib/development/server/lead-sources/lead-source-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { LeadSourceModalForm } from "@/components/development/sales/lead-source-modal-form";

export const metadata: Metadata = { title: "Lead sources · Marketing" };
export const dynamic = "force-dynamic";

export default async function LeadSourcesPage() {
  const sources = await safeQuery("leadSources", listLeadSources(), []);
  return (
    <DevelopmentShell>
      <PageHeader
        title="Lead sources"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Lead sources" },
        ]}
        description={`${sources.length} channel(s). Pre-seeded with 14 defaults; add custom channels as needed.`}
        actions={<LeadSourceModalForm />}
      />
      <Section title="All sources">
        {sources.length === 0 ? (
          <EmptyState title="No sources" description="Run the migrations to seed defaults." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Key</th>
                <th>Display name</th>
                <th>Channel type</th>
                <th>Platform</th>
                <th>Paid</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2 font-mono text-xs">
                    <Link
                      href={`/development-os/marketing/lead-sources/${s.sourceKey}`}
                      className="hover:underline"
                    >
                      {s.sourceKey}
                    </Link>
                  </td>
                  <td>{s.displayName}</td>
                  <td className="text-xs">{s.channelType}</td>
                  <td className="text-xs">{s.platform ?? "—"}</td>
                  <td>
                    <Badge tone={s.isPaid ? "warning" : "neutral"}>
                      {s.isPaid ? "paid" : "organic"}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={s.isActive ? "success" : "neutral"}>
                      {s.isActive ? "active" : "inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
