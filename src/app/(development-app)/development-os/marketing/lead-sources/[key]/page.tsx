import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb, rowsOf } from "@/lib/db/client";
import { getLeadSourceByKey } from "@/lib/development/server/lead-sources/lead-source-queries";
import { requireOrgId } from "@/features/auth/require-org";

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
    const organizationId = await requireOrgId();
    const r = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n FROM leads
       WHERE lead_source_key = ${key}
         AND organization_id = ${organizationId}
    `);
    leadCount = Number(rowsOf<{ n: string }>(r)[0]?.n ?? "0");
  }
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> /{" "}
            <Link href="/development-os/marketing/lead-sources">
              Lead sources
            </Link>{" "}
            / <span>{source.sourceKey}</span>
          </div>
          <h1>{source.displayName}</h1>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Configuration</div>
        <Card padding="default">
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
                <HandoffBadge tone={source.isPaid ? "warn" : "soft"}>
                  {source.isPaid ? "paid" : "organic"}
                </HandoffBadge>
              </dd>
            </div>
          </dl>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">Leads attributed</div>
        <Card padding="default">
          <p className="text-sm">
            <span className="text-3xl font-mono tabular-nums">{leadCount}</span>{" "}
            <span className="text-ink-tertiary">lead(s) attributed to this source.</span>
          </p>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
