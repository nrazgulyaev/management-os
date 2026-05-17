import _Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listDocuments } from "@/features/documents/services";
import { DocumentAddButton } from "@/components/documents/document-add-button";
import { isDbConfigured } from "@/lib/env";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const docs = await listDocuments();
  const source = isDbConfigured() ? "db" : "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Documents" }]}
        title="Documents"
        description="Metadata-only document records. Real file uploads live in Supabase Storage and arrive with the finance / owner statement work in v3+."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <DocumentAddButton />
          </div>
        }
      />
      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Title</TH>
            <TH>Type</TH>
            <TH>Entity</TH>
            <TH>Visibility</TH>
            <TH>Status</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {docs.length === 0 ? (
            <TR>
              <TD colSpan={6} className="text-ink-tertiary text-center py-8">
                No documents recorded.
              </TD>
            </TR>
          ) : (
            docs.map((d) => (
              <TR key={d.id}>
                <TD className="text-ink font-medium">{d.title}</TD>
                <TD>
                  <Badge tone="outline">{d.documentType}</Badge>
                </TD>
                <TD className="text-ink-secondary text-sm">
                  {d.entityType} · {d.entityId.slice(0, 8)}…
                </TD>
                <TD>
                  <Badge tone={d.visibility === "internal" ? "neutral" : "gold"}>
                    {d.visibility}
                  </Badge>
                </TD>
                <TD>
                  <Badge tone={d.status === "active" ? "success" : "neutral"}>{d.status}</Badge>
                </TD>
                <TD className="text-xs text-ink-tertiary">
                  {new Date(d.createdAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
