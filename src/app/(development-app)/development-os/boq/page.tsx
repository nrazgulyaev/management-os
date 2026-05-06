import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listBoqDocuments } from "@/lib/development/server/boq/boq-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "BOQ · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "neutral",
  under_review: "info",
  approved: "success",
  tender: "info",
  awarded: "success",
  superseded: "neutral",
  archived: "neutral",
};

export default async function BoqListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="BOQ" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const docs = await safeQuery("listBoqDocuments", listBoqDocuments(), [], 4000);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Knowledge Base" },
          { label: "BOQ" },
        ]}
        eyebrow={`${docs.length} BOQ document${docs.length === 1 ? "" : "s"}`}
        title="Bill of Quantities"
        description="Hierarchical line-item documents per project/villa with version history. Line totals are DB-computed (GENERATED STORED). Section subtotals + document totals are recomputed atomically when items change."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/development-os/boq/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New BOQ
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {docs.length === 0 ? (
        <EmptyState
          title="No BOQ documents yet"
          description="Create the first BOQ for a project. You can import sections + items via CSV after creation."
        />
      ) : (
        <Section eyebrow="Catalog" title="All BOQ documents">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Project</TH>
                <TH>Villa</TH>
                <TH>Version</TH>
                <TH>Status</TH>
                <TH>Total</TH>
              </TR>
            </THead>
            <TBody>
              {docs.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/boq/${encodeURIComponent(d.boqCode)}`}
                      className="hover:underline"
                    >
                      {d.boqCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{d.title}</TD>
                  <TD className="font-mono text-xs">{d.projectId.slice(0, 8)}</TD>
                  <TD className="font-mono text-xs">
                    {d.villaId?.slice(0, 8) ?? "—"}
                  </TD>
                  <TD className="text-xs">{d.versionLabel}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>
                      {d.status}
                    </Badge>
                  </TD>
                  <TDNum>
                    {d.totalAmountMinor != null
                      ? `${(Number(d.totalAmountMinor) / 100).toLocaleString()} ${d.currency}`
                      : "—"}
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
