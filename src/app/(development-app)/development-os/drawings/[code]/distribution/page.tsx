import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Drawing distribution</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/drawings">Drawings</Link> /{" "}
            <Link
              href={`/development-os/drawings/${encodeURIComponent(drawing.drawingCode)}`}
            >
              {drawing.drawingCode}
            </Link>{" "}
            / <span>Distribution</span>
          </div>
          <h1>Distribution log</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-revision vendor receipts. Operational requirement so site teams
            always know which revision the contractor was working from.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/drawings/${encodeURIComponent(drawing.drawingCode)}`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Drawing
          </Link>
        </div>
      </div>

      {dist.length === 0 ? (
        <EmptyState
          title="No distribution events yet"
          description="Once a revision is sent to a vendor, log it here so the chain of custody is preserved."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Log</div>
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
                    <HandoffBadge tone="soft">{d.distributionMethod}</HandoffBadge>
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
        </div>
      )}
    </DevelopmentShell>
  );
}
