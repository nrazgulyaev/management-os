import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listMethodStatements } from "@/lib/development/server/method-statements/method-statement-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Method statements · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "neutral",
  under_review: "info",
  approved: "info",
  active: "success",
  superseded: "neutral",
  archived: "neutral",
};

export default async function MethodStatementsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Method statements" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listMethodStatements",
    listMethodStatements(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Knowledge Base" },
          { label: "Method statements" },
        ]}
        eyebrow={`${rows.length} method statement${rows.length === 1 ? "" : "s"}`}
        title="Method statements / SOPs"
        description="Step-by-step procedures used by site staff. JSONB procedure_steps allows structured rendering. Tools, materials, PPE, hazards all declared upfront."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/development-os/method-statements/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New SOP
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

      {rows.length === 0 ? (
        <EmptyState
          title="No method statements yet"
          description="Add the first SOP to start building the procedural library."
        />
      ) : (
        <Section eyebrow="Catalog" title="All method statements">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>Version</TH>
                <TH>Status</TH>
                <TH>Effective</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => (
                <TR key={m.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/method-statements/${encodeURIComponent(m.methodCode)}`}
                      className="hover:underline"
                    >
                      {m.methodCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{m.title}</TD>
                  <TD>
                    <Badge tone="neutral">{m.category}</Badge>
                  </TD>
                  <TD className="text-xs">v{m.versionNumber}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>
                      {m.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{m.effectiveFrom ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
