import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getLeadSourceByKey } from "@/lib/development/server/lead-sources/lead-source-queries";

export const metadata: Metadata = { title: "Lead source · Marketing" };
export const dynamic = "force-dynamic";

export default async function LeadSourceDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const source = await getLeadSourceByKey(key);
  if (!source) notFound();
  const db = getDb();
  let leadCount = 0;
  if (db) {
    const r = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n FROM leads WHERE lead_source_key = ${key}
    `);
    leadCount = Number(
      (r as unknown as { rows: Array<{ n: string }> }).rows?.[0]?.n ?? "0",
    );
  }
  return (
    <DevelopmentShell>
      <PageHeader
        title={source.displayName}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Lead sources", href: "/development-os/marketing/lead-sources" },
          { label: source.sourceKey },
        ]}
      />
      <Section title="Configuration">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-tertiary text-xs">Channel type</dt>
            <dd>{source.channelType}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary text-xs">Platform</dt>
            <dd>{source.platform ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary text-xs">Default attribution</dt>
            <dd>{source.defaultAttributionModel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary text-xs">Paid</dt>
            <dd>
              <Badge tone={source.isPaid ? "warning" : "neutral"}>
                {source.isPaid ? "paid" : "organic"}
              </Badge>
            </dd>
          </div>
        </dl>
      </Section>
      <Section title="Leads attributed">
        <p className="text-sm">
          <span className="text-3xl font-mono tabular-nums">{leadCount}</span>{" "}
          <span className="text-ink-tertiary">lead(s) attributed to this source.</span>
        </p>
      </Section>
    </DevelopmentShell>
  );
}
