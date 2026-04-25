import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { DocumentForm } from "./form";

export const metadata = { title: "New document" };

export default function NewDocumentPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Documents", href: "/dashboard/documents" },
          { label: "New" },
        ]}
        title="New document"
        description="Records metadata only. Storage bucket / path are optional placeholders until file upload lands in v3."
      />
      <DbStatusNotice />
      <DocumentForm />
    </div>
  );
}
