import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getDrawingByCode,
  listDistributionForDrawing,
} from "@/lib/development/server/drawings/drawing-queries";

export const metadata: Metadata = {
  title: "Drawing distribution · Development OS",
};
export const dynamic = "force-dynamic";

export default async function DrawingDistributionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Drawing distribution" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getDrawingByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { drawing } = data;
  const dist = await listDistributionForDrawing(drawing.id);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Drawings", href: "/development-os/drawings" },
          {
            label: drawing.drawingCode,
            href: `/development-os/drawings/${encodeURIComponent(drawing.drawingCode)}`,
          },
          { label: "Distribution" },
        ]}
        eyebrow={`${dist.length} distribution event${dist.length === 1 ? "" : "s"}`}
        title="Distribution log"
        description="Per-revision vendor receipts. Operational requirement so site teams always know which revision the contractor was working from."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/drawings/${encodeURIComponent(drawing.drawingCode)}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Drawing
            </Link>
          </Button>
        }
      />

      {dist.length === 0 ? (
        <EmptyState
          title="No distribution events yet"
          description="Once a revision is sent to a vendor, log it here so the chain of custody is preserved."
        />
      ) : (
        <Section eyebrow="Log" title="Distribution events">
          <Table>
            <THead>
              <TR>
                <TH>Revision</TH>
                <TH>Vendor</TH>
                <TH>Distributed at</TH>
                <TH>Method</TH>
                <TH>Acknowledged</TH>
              </TR>
            </THead>
            <TBody>
              {dist.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">Rev {d.revisionLabel}</TD>
                  <TD className="font-mono text-xs">{d.vendorId.slice(0, 8)}</TD>
                  <TD className="text-xs">
                    {new Date(d.distributedAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </TD>
                  <TD>
                    <Badge tone="neutral">{d.distributionMethod}</Badge>
                  </TD>
                  <TD className="text-xs">
                    {d.acknowledgedAt
                      ? new Date(d.acknowledgedAt)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
