import { PageHeader } from "@/components/ui/page-header";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { DocumentAddButton } from "@/components/documents/document-add-button";
import { isDbConfigured } from "@/lib/env";
import {
  listDocsForApp,
  listTemplates,
  getDocCategoryCounts,
} from "@/features/documents/app-services";
import { DocumentsApp } from "@/components/documents/documents-app";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [docs, templates, counts] = await Promise.all([
    listDocsForApp(),
    listTemplates(),
    getDocCategoryCounts(),
  ]);
  const source = isDbConfigured() ? "db" : "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Documents" }]}
        title="Documents"
        description="Browse by category, preview and sign, request e-signatures, generate from templates, and feed documents to the AI knowledge base."
        actions={
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            <DocumentAddButton />
          </div>
        }
      />
      <DbStatusNotice />

      <DocumentsApp docs={docs} templates={templates} counts={counts} />
    </div>
  );
}
